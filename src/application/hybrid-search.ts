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

    interface Merged {
      hit: SearchHit;
      textRaw: number | null;
      textNormalized: number | null;
      vectorRaw: number | null;
      vectorNormalized: number | null;
      blended: number;
    }

    const byId = new Map<number, Merged>();
    for (const [hit, n] of textNorm) {
      byId.set(hit.document.id, {
        hit,
        textRaw: hit.score,
        textNormalized: n,
        vectorRaw: null,
        vectorNormalized: null,
        blended: this.weights.text * n,
      });
    }
    for (const [hit, n] of vectorNorm) {
      const existing = byId.get(hit.document.id);
      if (existing) {
        existing.vectorRaw = hit.score;
        existing.vectorNormalized = n;
        existing.blended += this.weights.vector * n;
      } else {
        byId.set(hit.document.id, {
          hit,
          textRaw: null,
          textNormalized: null,
          vectorRaw: hit.score,
          vectorNormalized: n,
          blended: this.weights.vector * n,
        });
      }
    }

    return [...byId.values()]
      .sort((a, b) => b.blended - a.blended)
      .slice(0, query.limit ?? 20)
      .map((m) => ({
        document: m.hit.document,
        score: m.blended,
        details: {
          kind: "hybrid" as const,
          textRawScore: m.textRaw,
          textNormalized: m.textNormalized,
          vectorRawScore: m.vectorRaw,
          vectorNormalized: m.vectorNormalized,
          textWeight: this.weights.text,
          vectorWeight: this.weights.vector,
          blendedScore: m.blended,
        },
      }));
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
