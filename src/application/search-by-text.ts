import type { SearchHit, SearchQuery } from "../domain/search-result.ts";
import type { TextSearchPort } from "../ports/text-search-port.ts";

export class SearchByText {
  constructor(private readonly textSearch: TextSearchPort) {}

  async execute(query: SearchQuery): Promise<SearchHit[]> {
    if (!query.q.trim()) return [];
    return this.textSearch.search(query);
  }
}
