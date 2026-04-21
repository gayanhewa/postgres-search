import type { Document } from "./document.ts";

export interface SearchHit {
  document: Document;
  /**
   * Engine-specific score. Higher is better for text-rank, and higher is
   * better here for vector too (we convert cosine distance to similarity
   * in the adapter so the UI can treat scores uniformly).
   */
  score: number;
  /** Optional explanation the adapter can use for debugging. */
  explain?: string;
}

export interface SearchQuery {
  q: string;
  limit?: number;
}
