import type { SearchHit, SearchQuery } from "../domain/search-result.ts";
import type { EmbeddingPort } from "../ports/embedding-port.ts";
import type { VectorSearchPort } from "../ports/vector-search-port.ts";

export class SearchByVector {
  constructor(
    private readonly embedder: EmbeddingPort,
    private readonly vectorSearch: VectorSearchPort,
  ) {}

  async execute(query: SearchQuery): Promise<SearchHit[]> {
    if (!query.q.trim()) return [];
    const embedding = await this.embedder.embed(query.q);
    return this.vectorSearch.searchByVector(embedding, query.limit);
  }
}
