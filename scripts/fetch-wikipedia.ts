import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Fetch Wikipedia article intros across a set of categories and write them
 * to a JSONL file that the seed script can consume.
 *
 * No account or API key is needed. We hit two public endpoints:
 *   - Action API (MediaWiki):  list pages in a category
 *   - REST API v1:             fetch a page summary (title + plain intro)
 *
 * Be polite: set a descriptive User-Agent and keep concurrency low.
 */

const UA = "postgres-search-playground/0.1 (https://github.com/gayanhewa/postgres-search)";

const DEFAULT_CATEGORIES = [
  "Database_management_systems",
  "Machine_learning",
  "Medieval_history",
  "Astronomy",
  "Cooking_techniques",
  "Jazz_musicians",
  "Programming_languages",
  "Bird_families",
];

const PER_CATEGORY = Number(process.env.WIKI_PER_CATEGORY ?? 200);
const CONCURRENCY = Number(process.env.WIKI_CONCURRENCY ?? 2);
const OUT = process.env.WIKI_OUT ?? "data/wikipedia.jsonl";
const REQUEST_DELAY_MS = Number(process.env.WIKI_DELAY_MS ?? 120);
const MAX_RETRIES = Number(process.env.WIKI_MAX_RETRIES ?? 5);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * fetch with backoff on 429 (Too Many Requests) and 5xx. Wikipedia will
 * return 429 with a Retry-After header when we push too hard.
 */
async function politeFetch(url: string | URL): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok || res.status === 404) return res;
    if (attempt >= MAX_RETRIES) return res;
    const retryAfter = Number(res.headers.get("retry-after")) || 0;
    const backoff = Math.max(retryAfter * 1000, 500 * 2 ** attempt);
    await sleep(backoff);
    attempt++;
  }
}

interface Member {
  title: string;
  ns: number;
}

interface Summary {
  title: string;
  extract?: string;
  description?: string;
}

interface DocRecord {
  title: string;
  body: string;
  tags: string[];
}

async function listCategoryMembers(category: string, limit: number): Promise<string[]> {
  const titles: string[] = [];
  let cmcontinue: string | undefined;

  while (titles.length < limit) {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "categorymembers");
    url.searchParams.set("cmtitle", `Category:${category}`);
    url.searchParams.set("cmlimit", String(Math.min(500, limit - titles.length)));
    url.searchParams.set("cmtype", "page");
    url.searchParams.set("format", "json");
    if (cmcontinue) url.searchParams.set("cmcontinue", cmcontinue);

    const res = await politeFetch(url);
    if (!res.ok) throw new Error(`categorymembers ${category} HTTP ${res.status}`);
    const data = (await res.json()) as {
      query: { categorymembers: Member[] };
      continue?: { cmcontinue?: string };
    };

    for (const m of data.query.categorymembers) {
      if (m.ns === 0) titles.push(m.title);
      if (titles.length >= limit) break;
    }

    cmcontinue = data.continue?.cmcontinue;
    if (!cmcontinue) break;
  }

  return titles;
}

async function fetchSummary(title: string): Promise<Summary | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await politeFetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`summary ${title} HTTP ${res.status}`);
  if (REQUEST_DELAY_MS > 0) await sleep(REQUEST_DELAY_MS);
  return (await res.json()) as Summary;
}

/**
 * Run an async worker pool over items with fixed concurrency.
 * Cheaper than pulling in a dependency for this one use.
 */
async function pool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function runner() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
  return results;
}

async function main() {
  const categoriesArg = process.env.WIKI_CATEGORIES;
  const categories = categoriesArg
    ? categoriesArg.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_CATEGORIES;

  const outPath = join(process.cwd(), OUT);
  await mkdir(dirname(outPath), { recursive: true });

  console.log(`fetching up to ${PER_CATEGORY} articles from ${categories.length} categories`);
  console.log(`concurrency=${CONCURRENCY}, output=${outPath}`);

  const records: DocRecord[] = [];
  const seen = new Set<string>();

  for (const category of categories) {
    process.stdout.write(`  [${category}] listing... `);
    const titles = await listCategoryMembers(category, PER_CATEGORY);
    process.stdout.write(`${titles.length} titles. fetching summaries... `);

    let count = 0;
    await pool(titles, CONCURRENCY, async (title) => {
      if (seen.has(title)) return;
      seen.add(title);
      try {
        const s = await fetchSummary(title);
        if (!s?.extract) return;
        if (s.extract.length < 120) return;
        records.push({
          title: s.title,
          body: s.extract,
          tags: [category.replace(/_/g, " ").toLowerCase()],
        });
        count++;
      } catch (err) {
        console.warn(`\n    skip ${title}: ${err instanceof Error ? err.message : err}`);
      }
    });
    console.log(`${count} kept`);
  }

  const lines = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  await writeFile(outPath, lines, "utf8");
  console.log(`\nwrote ${records.length} records to ${outPath}`);
}

await main();
