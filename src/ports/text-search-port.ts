import type { SearchHit, SearchQuery } from "../domain/search-result.ts";

export interface TextSearchPort {
  search(query: SearchQuery): Promise<SearchHit[]>;
}
