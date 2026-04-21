import { beforeEach, describe, expect, it } from "bun:test";
import { DeterministicFakeEmbedding } from "../../src/adapters/embedding/deterministic-fake-embedding.ts";
import { InMemoryDocumentStore } from "../../src/adapters/inmemory/document-repository.memory.ts";
import { HybridSearch } from "../../src/application/hybrid-search.ts";
import { IndexDocument } from "../../src/application/index-document.ts";

describe("HybridSearch", () => {
  let store: InMemoryDocumentStore;
  let hybrid: HybridSearch;

  beforeEach(async () => {
    const embedder = new DeterministicFakeEmbedding();
    store = new InMemoryDocumentStore();
    const indexDoc = new IndexDocument(store, embedder);
    hybrid = new HybridSearch(embedder, store, store);
    await indexDoc.execute({ title: "Postgres Indexing", body: "btree gin gist" });
    await indexDoc.execute({ title: "Vector Search", body: "pgvector similarity" });
    await indexDoc.execute({ title: "Baking Bread", body: "flour yeast water" });
  });

  it("returns empty for blank queries", async () => {
    expect(await hybrid.execute({ q: "" })).toEqual([]);
  });

  it("merges text and vector results and returns a single ranked list", async () => {
    const hits = await hybrid.execute({ q: "postgres", limit: 5 });
    expect(hits.length).toBeGreaterThan(0);
    const ids = hits.map((h) => h.document.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("produces scores in descending order", async () => {
    const hits = await hybrid.execute({ q: "postgres indexing" });
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
    }
  });
});
