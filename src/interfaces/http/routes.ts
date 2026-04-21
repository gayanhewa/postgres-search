import { renderFile } from "ejs";
import { join } from "node:path";
import type { Container } from "../../composition-root.ts";
import type { SearchHit } from "../../domain/search-result.ts";

const VIEWS_DIR = join(process.cwd(), "src", "interfaces", "http", "views");

const ENGINE_META = {
  tsvector: {
    title: "tsvector / tsquery",
    summary:
      "Keyword search. The query is parsed with websearch_to_tsquery('english', q), which lowercases, stems, and drops stop words. Postgres then checks the stored search_tsv column for matching lexemes with the @@ operator, and ts_rank_cd scores each hit using the weights {0.1, 0.2, 0.4, 1.0} for {D, C, B, A}. Titles are tagged weight A and bodies weight B in sql/001_init.sql, so title matches count for more.",
    sql: `WITH q AS (
  SELECT websearch_to_tsquery('english', $1) AS tsq
)
SELECT d.*, ts_rank_cd('{0.1, 0.2, 0.4, 1.0}', d.search_tsv, q.tsq) AS score
FROM documents d, q
WHERE d.search_tsv @@ q.tsq
ORDER BY score DESC`,
    code: "src/adapters/postgres/text-search.pg.ts",
  },
  pgvector: {
    title: "pgvector",
    summary:
      "Vector similarity. The query string is turned into a 128-dim embedding by the DeterministicFakeEmbedding adapter (hashed bag-of-words plus bigrams, L2 normalized). Postgres orders documents by cosine distance (the <=> operator) against the stored embedding column. We return 1 - distance as the similarity score so higher is better, matching the text engine.",
    sql: `SELECT d.*, (embedding <=> $1::vector) AS distance
FROM documents
WHERE embedding IS NOT NULL
ORDER BY embedding <=> $1::vector
LIMIT $2`,
    code: "src/adapters/postgres/vector-search.pg.ts (+ src/adapters/embedding/deterministic-fake-embedding.ts)",
  },
  hybrid: {
    title: "hybrid",
    summary:
      "Runs both engines, then blends. For each engine we min-max normalize the raw scores into 0..1, multiply by the configured weight (50/50 here), and sum. Documents that appear in only one list still get their single-engine contribution. Production systems usually use reciprocal rank fusion (RRF) or a learned reranker instead; this simple blend is easy to inspect.",
    sql: "(runs both SQL queries above and merges in TS)",
    code: "src/application/hybrid-search.ts",
  },
} as const;

export async function handleRequest(req: Request, c: Container): Promise<Response> {
  const url = new URL(req.url);

  try {
    if (req.method === "GET" && url.pathname === "/") {
      return await renderHome();
    }
    if (req.method === "GET" && url.pathname === "/api/search") {
      return await searchText(url, c);
    }
    if (req.method === "GET" && url.pathname === "/api/vector") {
      return await searchVector(url, c);
    }
    if (req.method === "GET" && url.pathname === "/api/hybrid") {
      return await searchHybrid(url, c);
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true });
    }
    return new Response("Not found", { status: 404 });
  } catch (err) {
    console.error(err);
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
}

async function renderHome(): Promise<Response> {
  const html = await renderFile(join(VIEWS_DIR, "index.ejs"), {});
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

async function searchText(url: URL, c: Container): Promise<Response> {
  const q = url.searchParams.get("q") ?? "";
  const limit = intParam(url, "limit", 20);
  const hits = await c.searchByText.execute({ q, limit });
  return json({ engine: "tsvector", q, meta: ENGINE_META.tsvector, hits: shape(hits) });
}

async function searchVector(url: URL, c: Container): Promise<Response> {
  const q = url.searchParams.get("q") ?? "";
  const limit = intParam(url, "limit", 20);
  const hits = await c.searchByVector.execute({ q, limit });
  return json({ engine: "pgvector", q, meta: ENGINE_META.pgvector, hits: shape(hits) });
}

async function searchHybrid(url: URL, c: Container): Promise<Response> {
  const q = url.searchParams.get("q") ?? "";
  const limit = intParam(url, "limit", 20);
  const hits = await c.hybridSearch.execute({ q, limit });
  return json({ engine: "hybrid", q, meta: ENGINE_META.hybrid, hits: shape(hits) });
}

function intParam(url: URL, key: string, fallback: number): number {
  const raw = url.searchParams.get(key);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function shape(hits: SearchHit[]) {
  return hits.map((h) => ({
    id: h.document.id,
    title: h.document.title,
    body: h.document.body,
    tags: h.document.tags,
    score: Number(h.score.toFixed(6)),
    details: h.details,
  }));
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
