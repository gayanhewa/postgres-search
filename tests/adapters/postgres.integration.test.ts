import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DeterministicFakeEmbedding } from "../../src/adapters/embedding/deterministic-fake-embedding.ts";
import { createSql, type Sql } from "../../src/adapters/postgres/client.ts";
import { PgDocumentRepository } from "../../src/adapters/postgres/document-repository.pg.ts";
import { PgTextSearch } from "../../src/adapters/postgres/text-search.pg.ts";
import { PgVectorSearch } from "../../src/adapters/postgres/vector-search.pg.ts";
import { IndexDocument } from "../../src/application/index-document.ts";
import { SearchByText } from "../../src/application/search-by-text.ts";
import { SearchByVector } from "../../src/application/search-by-vector.ts";
import { loadEnv } from "../../src/config/env.ts";

const enabled = process.env.TEST_DB === "1" || process.env.TEST_DB === "true";
const d = enabled ? describe : describe.skip;

d("postgres adapters integration", () => {
  const env = loadEnv();
  let sql: Sql;
  let indexDoc: IndexDocument;
  let searchByText: SearchByText;
  let searchByVector: SearchByVector;

  beforeAll(async () => {
    sql = createSql(env.DATABASE_URL);
    const repo = new PgDocumentRepository(sql);
    const text = new PgTextSearch(sql);
    const vector = new PgVectorSearch(sql);
    const embedder = new DeterministicFakeEmbedding();
    indexDoc = new IndexDocument(repo, embedder);
    searchByText = new SearchByText(text);
    searchByVector = new SearchByVector(embedder, vector);
    await repo.clear();
    await indexDoc.execute({
      title: "Postgres Indexing Basics",
      body: "btree and gin indexes power most production workloads",
      tags: ["postgres"],
    });
    await indexDoc.execute({
      title: "Baking Bread at Home",
      body: "flour yeast water salt and time",
      tags: ["food"],
    });
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("finds documents via tsvector", async () => {
    const hits = await searchByText.execute({ q: "postgres indexing" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.document.title).toContain("Postgres");
  });

  it("finds documents via pgvector", async () => {
    const hits = await searchByVector.execute({ q: "postgres indexing" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.document.title).toContain("Postgres");
  });
});
