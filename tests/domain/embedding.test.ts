import { describe, expect, it } from "bun:test";
import { DeterministicFakeEmbedding } from "../../src/adapters/embedding/deterministic-fake-embedding.ts";
import { EMBEDDING_DIMS } from "../../src/domain/embedding.ts";

describe("DeterministicFakeEmbedding", () => {
  const embedder = new DeterministicFakeEmbedding();

  it("returns a vector with the configured dimensions", async () => {
    const v = await embedder.embed("hello world");
    expect(v.length).toBe(EMBEDDING_DIMS);
  });

  it("is deterministic for the same input", async () => {
    const a = await embedder.embed("postgres indexing");
    const b = await embedder.embed("postgres indexing");
    expect(a).toEqual(b);
  });

  it("produces an L2-normalized vector", async () => {
    const v = await embedder.embed("some words here");
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
  });

  it("returns a zero vector for empty text", async () => {
    const v = await embedder.embed("");
    expect(v.every((x) => x === 0)).toBe(true);
  });
});
