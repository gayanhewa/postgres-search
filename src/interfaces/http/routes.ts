import { renderFile } from "ejs";
import { join } from "node:path";
import type { Container } from "../../composition-root.ts";
import type { SearchHit } from "../../domain/search-result.ts";

const VIEWS_DIR = join(process.cwd(), "src", "interfaces", "http", "views");

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
  return json({ engine: "tsvector", q, hits: shape(hits) });
}

async function searchVector(url: URL, c: Container): Promise<Response> {
  const q = url.searchParams.get("q") ?? "";
  const limit = intParam(url, "limit", 20);
  const hits = await c.searchByVector.execute({ q, limit });
  return json({ engine: "pgvector", q, hits: shape(hits) });
}

async function searchHybrid(url: URL, c: Container): Promise<Response> {
  const q = url.searchParams.get("q") ?? "";
  const limit = intParam(url, "limit", 20);
  const hits = await c.hybridSearch.execute({ q, limit });
  return json({ engine: "hybrid", q, hits: shape(hits) });
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
  }));
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
