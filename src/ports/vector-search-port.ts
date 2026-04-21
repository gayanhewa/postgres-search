import type { Embedding } from "../domain/embedding.ts";
import type { SearchHit } from "../domain/search-result.ts";

export interface VectorSearchPort {
  searchByVector(embedding: Embedding, limit?: number): Promise<SearchHit[]>;
}
