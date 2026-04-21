import { DeterministicFakeEmbedding } from "./adapters/embedding/deterministic-fake-embedding.ts";
import { createSql, type Sql } from "./adapters/postgres/client.ts";
import { PgDocumentRepository } from "./adapters/postgres/document-repository.pg.ts";
import { PgTextSearch } from "./adapters/postgres/text-search.pg.ts";
import { PgVectorSearch } from "./adapters/postgres/vector-search.pg.ts";
import { HybridSearch } from "./application/hybrid-search.ts";
import { IndexDocument } from "./application/index-document.ts";
import { SearchByText } from "./application/search-by-text.ts";
import { SearchByVector } from "./application/search-by-vector.ts";
import { loadEnv } from "./config/env.ts";

export interface Container {
  sql: Sql;
  indexDocument: IndexDocument;
  searchByText: SearchByText;
  searchByVector: SearchByVector;
  hybridSearch: HybridSearch;
}

export function buildContainer(): Container {
  const env = loadEnv();
  const sql = createSql(env.DATABASE_URL);

  const repo = new PgDocumentRepository(sql);
  const textSearch = new PgTextSearch(sql);
  const vectorSearch = new PgVectorSearch(sql);
  const embedder = new DeterministicFakeEmbedding();

  return {
    sql,
    indexDocument: new IndexDocument(repo, embedder),
    searchByText: new SearchByText(textSearch),
    searchByVector: new SearchByVector(embedder, vectorSearch),
    hybridSearch: new HybridSearch(embedder, textSearch, vectorSearch),
  };
}
