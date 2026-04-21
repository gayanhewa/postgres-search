import type { SearchHit, SearchQuery } from "../../domain/search-result.ts";
import type { TextSearchPort } from "../../ports/text-search-port.ts";
import type { Sql } from "./client.ts";

interface Row {
  id: number;
  title: string;
  body: string;
  tags: string[];
  created_at: Date;
  score: number;
  parsed_tsquery: string;
  matched_lexemes: string[];
  tsvector_preview: string;
}

const WEIGHTS: [number, number, number, number] = [0.1, 0.2, 0.4, 1.0];

/**
 * Full-text search with tsvector / tsquery.
 *
 * Query building: `plainto_tsquery` is forgiving (just AND of lexemes).
 * `websearch_to_tsquery` is closer to how users phrase things in a search
 * box (quotes, OR, minus). We default to websearch_to_tsquery here since
 * that is what the UI presents.
 *
 * Ranking: `ts_rank_cd` uses cover density. The {0.1, 0.2, 0.4, 1.0} array
 * gives the weight for D, C, B, A lexemes (the weights set in the generated
 * column). Title matches therefore count for more than body matches.
 *
 * The SELECT also returns teaching metadata (parsed tsquery, matched
 * lexemes, a tsvector preview) so the UI can show what actually happened.
 */
export class PgTextSearch implements TextSearchPort {
  constructor(private readonly sql: Sql) {}

  async search(query: SearchQuery): Promise<SearchHit[]> {
    const limit = query.limit ?? 20;
    const rows = await this.sql<Row[]>`
      WITH q AS (
        SELECT websearch_to_tsquery('english', ${query.q}) AS tsq
      ),
      -- Pull individual lexemes out of the tsquery by matching quoted tokens
      -- in its text form. Example: '''postgres'' & ''index''' yields
      -- {postgres, index}. We strip the leading colon+weight marker (':*A')
      -- that tsquery uses for prefix / weighted lexemes.
      q_lex AS (
        SELECT array_agg(DISTINCT regexp_replace(m[1], ':[^,]+$', '')) AS lexemes
        FROM q,
             LATERAL regexp_matches(tsq::text, '''([^'']+)''', 'g') AS m
      )
      SELECT
        d.id,
        d.title,
        d.body,
        d.tags,
        d.created_at,
        ts_rank_cd(${this.sql.array(
          WEIGHTS as unknown as number[],
        )}::float4[], d.search_tsv, q.tsq) AS score,
        q.tsq::text AS parsed_tsquery,
        -- Intersection of doc lexemes and query lexemes, as a text[].
        (
          SELECT COALESCE(array_agg(lex ORDER BY lex), ARRAY[]::text[])
          FROM unnest(tsvector_to_array(d.search_tsv)) AS lex
          WHERE lex = ANY(COALESCE((SELECT lexemes FROM q_lex), ARRAY[]::text[]))
        ) AS matched_lexemes,
        -- Human-friendly preview of the tsvector. Strip positional info and
        -- truncate so it fits in the UI.
        left(regexp_replace(d.search_tsv::text, ':[^ ]+', '', 'g'), 280) AS tsvector_preview
      FROM documents d, q
      WHERE d.search_tsv @@ q.tsq
      ORDER BY score DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      document: {
        id: Number(r.id),
        title: r.title,
        body: r.body,
        tags: r.tags,
        createdAt: r.created_at,
      },
      score: Number(r.score),
      details: {
        kind: "tsvector" as const,
        parsedTsquery: r.parsed_tsquery,
        matchedLexemes: r.matched_lexemes ?? [],
        tsvectorPreview: r.tsvector_preview,
        weights: WEIGHTS,
        rawScore: Number(r.score),
      },
    }));
  }
}
