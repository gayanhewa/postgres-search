import type { SearchHit, SearchQuery } from "../domain/search-result.ts";
import type { EmbeddingPort } from "../ports/embedding-port.ts";
import type { TextSearchPort } from "../ports/text-search-port.ts";
import type { VectorSearchPort } from "../ports/vector-search-port.ts";

export interface HybridWeights {
  text: number;
  vector: number;
}

const DEFAULT_WEIGHTS: HybridWeights = { text: 0.5, vector: 0.5 };

/**
 * Hybrid search: run both engines, normalize each score list to 0..1,
 * then blend with configurable weights. This is a teaching implementation
 * that shows the mechanics. Production systems often use reciprocal rank
 * fusion (RRF) or a learned reranker instead.
 */
export class HybridSearch {
  constructor(
    private readonly embedder: EmbeddingPort,
    private readonly textSearch: TextSearchPort,
    private readonly vectorSearch: VectorSearchPort,
    private readonly weights: HybridWeights = DEFAULT_WEIGHTS,
  ) {}

  async execute(query: SearchQuery): Promise<SearchHit[]> {
    if (!query.q.trim()) return [];

    const [textHits, embedding] = await Promise.all([
      this.textSearch.search(query),
      this.embedder.embed(query.q),
    ]);
    const vectorHits = await this.vectorSearch.searchByVector(embedding, query.limit);

    const textNorm = normalize(textHits);
    const vectorNorm = normalize(vectorHits);

    const byId = new Map<number, { hit: SearchHit; score: number }>();
    for (const [hit, s] of textNorm) {
      byId.set(hit.document.id, { hit, score: this.weights.text * s });
    }
    for (const [hit, s] of vectorNorm) {
      const existing = byId.get(hit.document.id);
      if (existing) {
        existing.score += this.weights.vector * s;
      } else {
        byId.set(hit.document.id, { hit, score: this.weights.vector * s });
      }
    }

    return [...byId.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, query.limit ?? 20)
      .map(({ hit, score }) => ({ ...hit, score }));
  }
}

function normalize(hits: SearchHit[]): Array<[SearchHit, number]> {
  if (hits.length === 0) return [];
  const scores = hits.map((h) => h.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min;
  return hits.map((h) => [h, span === 0 ? 1 : (h.score - min) / span]);
}
