import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { faker } from "@faker-js/faker";
import { DeterministicFakeEmbedding } from "../src/adapters/embedding/deterministic-fake-embedding.ts";
import { createSql } from "../src/adapters/postgres/client.ts";
import { PgDocumentRepository } from "../src/adapters/postgres/document-repository.pg.ts";
import { IndexDocument } from "../src/application/index-document.ts";
import { loadEnv } from "../src/config/env.ts";

/**
 * Seed the database.
 *
 * SEED_SOURCE controls what noise gets loaded on top of the curated docs:
 *   - "faker"     (default): random lorem-ipsum articles. Fast, offline, but
 *                 gives search nothing interesting to discriminate on.
 *   - "wikipedia": reads data/wikipedia.jsonl produced by
 *                 `bun run data:fetch`. Real topical text across several
 *                 Wikipedia categories. Much more useful for learning.
 *
 * Both modes keep the curated docs on top of the table so the playground's
 * "postgres indexing" queries still land on familiar titles.
 */

faker.seed(42);

interface DocInput {
  title: string;
  body: string;
  tags: string[];
}

const CURATED: DocInput[] = [
  {
    title: "An Introduction to Postgres Indexing",
    body:
      "B-tree indexes are the default in Postgres and support equality and range queries. " +
      "GIN and GiST indexes underpin full-text search and trigram matching, while BRIN is useful for very large, naturally ordered tables. " +
      "Picking the right index means understanding query shape, selectivity, and write amplification.",
    tags: ["postgres", "indexing", "performance"],
  },
  {
    title: "Full-Text Search with tsvector and tsquery",
    body:
      "Postgres ships a capable full-text search engine. Documents become tsvectors by running to_tsvector with a language configuration. " +
      "Queries are parsed into tsqueries. Ranking uses ts_rank or ts_rank_cd with configurable weights for title and body.",
    tags: ["postgres", "fts", "tsvector"],
  },
  {
    title: "Vector Similarity Search with pgvector",
    body:
      "pgvector adds a VECTOR type to Postgres along with distance operators for L2, cosine, and inner product. " +
      "Paired with IVFFlat or HNSW indexes, it turns Postgres into a practical vector database for embeddings up to a few thousand dimensions.",
    tags: ["postgres", "pgvector", "embeddings"],
  },
  {
    title: "Tuning ts_rank: Weights, Normalization, and Cover Density",
    body:
      "ts_rank and ts_rank_cd accept an array of four weights for D, C, B, A lexemes. " +
      "Combined with setweight on the tsvector, this lets you boost title matches over body matches. " +
      "The normalization flag controls how document length affects the score.",
    tags: ["postgres", "fts", "ranking"],
  },
  {
    title: "Choosing Between IVFFlat and HNSW in pgvector",
    body:
      "IVFFlat is fast to build and small on disk, trading recall for speed. " +
      "HNSW is higher recall and faster to query but costs more RAM and build time. " +
      "For most application workloads HNSW is the better default once your dataset warrants an ANN index.",
    tags: ["pgvector", "ann", "indexes"],
  },
  {
    title: "Hybrid Search: Combining Keyword and Vector Retrieval",
    body:
      "Pure lexical search misses paraphrases. Pure vector search misses exact identifiers. " +
      "Hybrid retrieval runs both and blends scores, often via reciprocal rank fusion, to get the best of each.",
    tags: ["search", "hybrid", "retrieval"],
  },
  {
    title: "A Guide to Database Performance Tuning",
    body:
      "Performance tuning starts with measuring. Use EXPLAIN ANALYZE to see the plan, check pg_stat_statements for hot queries, and look at index usage. " +
      "Configuration knobs like work_mem and shared_buffers matter, but query shape and indexing usually dominate.",
    tags: ["postgres", "performance", "tuning"],
  },
  {
    title: "Understanding GIN and GiST Indexes",
    body:
      "GIN is optimized for multi-valued columns (arrays, jsonb, tsvector) and gives fast reads at the cost of slower writes. " +
      "GiST is more general, supporting geometric data, full-text, and range types with good write performance.",
    tags: ["postgres", "indexing"],
  },
];

function buildFakerDocs(count: number): DocInput[] {
  const docs: DocInput[] = [];
  for (let i = 0; i < count; i++) {
    const paragraphs = faker.number.int({ min: 2, max: 5 });
    docs.push({
      title: faker.lorem.sentence({ min: 4, max: 10 }),
      body: faker.lorem.paragraphs(paragraphs, "\n\n"),
      tags: faker.helpers.arrayElements(
        ["postgres", "sql", "search", "indexing", "embeddings", "performance", "tips", "devops"],
        { min: 0, max: 3 },
      ),
    });
  }
  return docs;
}

async function loadWikipediaDocs(path: string, limit?: number): Promise<DocInput[]> {
  const raw = await readFile(path, "utf8").catch((err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(
        `\n${path} not found. Run 'bun run data:fetch' first to produce it.\n`,
      );
      process.exit(1);
    }
    throw err;
  });
  const docs: DocInput[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const parsed = JSON.parse(line) as DocInput;
    docs.push(parsed);
    if (limit && docs.length >= limit) break;
  }
  return docs;
}

const env = loadEnv();
const sql = createSql(env.DATABASE_URL);
const repo = new PgDocumentRepository(sql);
const embedder = new DeterministicFakeEmbedding();
const indexDoc = new IndexDocument(repo, embedder);

const SEED_SOURCE = (process.env.SEED_SOURCE ?? "faker").toLowerCase();
const RANDOM_COUNT = Number(process.env.SEED_RANDOM_COUNT ?? 200);
const WIKI_PATH = process.env.SEED_WIKI_PATH ?? join(process.cwd(), "data", "wikipedia.jsonl");
const WIKI_LIMIT = process.env.SEED_WIKI_LIMIT ? Number(process.env.SEED_WIKI_LIMIT) : undefined;

const existing = await repo.count();
if (existing > 0) {
  console.log(`documents table already has ${existing} rows, truncating first`);
  await repo.clear();
}

console.log("seeding curated documents");
for (const d of CURATED) {
  await indexDoc.execute(d);
}

let noise: DocInput[];
if (SEED_SOURCE === "wikipedia") {
  console.log(`loading Wikipedia docs from ${WIKI_PATH}`);
  noise = await loadWikipediaDocs(WIKI_PATH, WIKI_LIMIT);
  console.log(`seeding ${noise.length} Wikipedia documents`);
} else {
  noise = buildFakerDocs(RANDOM_COUNT);
  console.log(`seeding ${noise.length} random faker documents`);
}

for (const d of noise) {
  await indexDoc.execute(d);
}

const total = await repo.count();
console.log(`done. documents table now has ${total} rows`);

// Rebuild IVFFlat to match the new data distribution. For large tables this
// should use CONCURRENTLY, but for a seed script the short downtime is fine.
console.log("reindexing documents_embedding_idx for better vector recall");
await sql`REINDEX INDEX documents_embedding_idx`;
await sql`ANALYZE documents`;

await sql.end();
