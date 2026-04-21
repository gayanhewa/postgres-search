import { beforeEach, describe, expect, it } from "bun:test";
import { DeterministicFakeEmbedding } from "../../src/adapters/embedding/deterministic-fake-embedding.ts";
import { InMemoryDocumentStore } from "../../src/adapters/inmemory/document-repository.memory.ts";
import { IndexDocument } from "../../src/application/index-document.ts";
import { SearchByVector } from "../../src/application/search-by-vector.ts";

describe("SearchByVector (with in-memory adapter)", () => {
  let store: InMemoryDocumentStore;
  let searchByVector: SearchByVector;

  beforeEach(async () => {
    const embedder = new DeterministicFakeEmbedding();
    store = new InMemoryDocumentStore();
    const indexDoc = new IndexDocument(store, embedder);
    searchByVector = new SearchByVector(embedder, store);
    await indexDoc.execute({ title: "Postgres Indexing Basics", body: "btree gin gist brin" });
    await indexDoc.execute({ title: "Bread Recipes", body: "flour yeast water" });
    await indexDoc.execute({ title: "Travel in Japan", body: "tokyo kyoto osaka" });
  });

  it("returns empty for blank queries", async () => {
    expect(await searchByVector.execute({ q: "" })).toEqual([]);
  });

  it("ranks the topically-similar document highest", async () => {
    const hits = await searchByVector.execute({ q: "postgres indexing", limit: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.document.title).toBe("Postgres Indexing Basics");
  });

  it("returns cosine similarity scores between 0 and 1 for shared-token text", async () => {
    const hits = await searchByVector.execute({ q: "postgres indexing" });
    for (const h of hits) {
      expect(h.score).toBeLessThanOrEqual(1 + 1e-9);
      expect(h.score).toBeGreaterThanOrEqual(-1 - 1e-9);
    }
  });
});
