import { EMBEDDING_DIMS, type Embedding } from "../../domain/embedding.ts";
import type { EmbeddingPort } from "../../ports/embedding-port.ts";

/**
 * Deterministic hashed bag-of-words embedding.
 *
 * Why this exists: real embedding APIs need an account and a key. For a
 * self-contained playground we trade semantic quality for zero setup.
 *
 * How it works:
 * 1. Lowercase and tokenize on non-word characters.
 * 2. Remove very short tokens.
 * 3. Hash each token with FNV-1a, pick a bucket (dim), add 1.
 * 4. Also hash bigrams with a different salt so co-occurrence matters.
 * 5. L2 normalize.
 *
 * Properties:
 * - Same text always produces the same vector.
 * - Texts that share many tokens will have high cosine similarity.
 * - Synonyms / semantic similarity are NOT captured. That is on purpose:
 *   the README explains that limitation so the user can see where real
 *   embeddings would win over keyword matching.
 */
export class DeterministicFakeEmbedding implements EmbeddingPort {
  constructor(private readonly dims: number = EMBEDDING_DIMS) {}

  async embed(text: string): Promise<Embedding> {
    const vec = new Array<number>(this.dims).fill(0);
    const tokens = tokenize(text);
    for (const t of tokens) {
      vec[fnv1a(t) % this.dims] += 1;
    }
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]}_${tokens[i + 1]}`;
      vec[fnv1a("bg:" + bigram) % this.dims] += 0.5;
    }
    return l2Normalize(vec);
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

function fnv1a(input: string): number {
  // 32-bit FNV-1a hash. Kept in an unsigned range via >>> 0.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function l2Normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}
