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
}

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
 */
export class PgTextSearch implements TextSearchPort {
  constructor(private readonly sql: Sql) {}

  async search(query: SearchQuery): Promise<SearchHit[]> {
    const limit = query.limit ?? 20;
    const rows = await this.sql<Row[]>`
      WITH q AS (
        SELECT websearch_to_tsquery('english', ${query.q}) AS tsq
      )
      SELECT
        d.id,
        d.title,
        d.body,
        d.tags,
        d.created_at,
        ts_rank_cd('{0.1, 0.2, 0.4, 1.0}', d.search_tsv, q.tsq) AS score
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
    }));
  }
}
