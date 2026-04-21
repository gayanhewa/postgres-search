import { beforeEach, describe, expect, it } from "bun:test";
import { DeterministicFakeEmbedding } from "../../src/adapters/embedding/deterministic-fake-embedding.ts";
import { InMemoryDocumentStore } from "../../src/adapters/inmemory/document-repository.memory.ts";
import { IndexDocument } from "../../src/application/index-document.ts";
import { SearchByText } from "../../src/application/search-by-text.ts";

describe("SearchByText (with in-memory adapter)", () => {
  let store: InMemoryDocumentStore;
  let indexDoc: IndexDocument;
  let searchByText: SearchByText;

  beforeEach(async () => {
    store = new InMemoryDocumentStore();
    indexDoc = new IndexDocument(store, new DeterministicFakeEmbedding());
    searchByText = new SearchByText(store);
    await indexDoc.execute({ title: "Postgres Indexing", body: "B-tree, GIN, GiST, BRIN" });
    await indexDoc.execute({ title: "Baking Bread", body: "flour, yeast, water, salt" });
    await indexDoc.execute({ title: "Trip to Japan", body: "Tokyo, Kyoto, Osaka" });
  });

  it("returns empty for blank queries", async () => {
    expect(await searchByText.execute({ q: "   " })).toEqual([]);
  });

  it("finds matches by keyword", async () => {
    const hits = await searchByText.execute({ q: "postgres" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.document.title).toBe("Postgres Indexing");
  });

  it("ranks title matches above body-only matches", async () => {
    await indexDoc.execute({ title: "Hobby cooking", body: "postgres is great too" });
    const hits = await searchByText.execute({ q: "postgres" });
    expect(hits[0]?.document.title).toBe("Postgres Indexing");
  });
});
