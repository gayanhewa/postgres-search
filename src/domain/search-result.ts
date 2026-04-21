import type { Document } from "./document.ts";

/**
 * Per-hit structured explanation. Adapters fill this so the UI can show
 * "what happened under the hood" for each result.
 *
 * `kind` is a discriminator; each engine contributes its own shape.
 */
export type HitDetails =
  | {
      kind: "tsvector";
      /** Raw tsquery as parsed by Postgres (`SELECT tsq::text`). */
      parsedTsquery: string;
      /** Lexemes from the doc's search_tsv that matched the query. */
      matchedLexemes: string[];
      /** A compact preview of the doc's stored search_tsv. */
      tsvectorPreview: string;
      /** {D, C, B, A} weights used by ts_rank_cd, matching setweight buckets. */
      weights: [number, number, number, number];
      rawScore: number;
    }
  | {
      kind: "pgvector";
      /** Cosine distance straight from `embedding <=> query_vec`. */
      cosineDistance: number;
      /** 1 - distance. This is what we expose as `score`. */
      cosineSimilarity: number;
      /** L2 norm of the query vector (our embeddings are pre-normalized to ~1). */
      queryNorm: number;
      /**
       * Top K dims of the query vector. Lets the user see the hashed
       * bag-of-words vector is sparse and which buckets dominate.
       */
      topQueryDims: Array<{ dim: number; value: number }>;
    }
  | {
      kind: "hybrid";
      textRawScore: number | null;
      textNormalized: number | null;
      vectorRawScore: number | null;
      vectorNormalized: number | null;
      textWeight: number;
      vectorWeight: number;
      blendedScore: number;
    };

export interface SearchHit {
  document: Document;
  /**
   * Engine-specific score. Higher is better for text-rank, and higher is
   * better here for vector too (we convert cosine distance to similarity
   * in the adapter so the UI can treat scores uniformly).
   */
  score: number;
  details?: HitDetails;
}

export interface SearchQuery {
  q: string;
  limit?: number;
}
