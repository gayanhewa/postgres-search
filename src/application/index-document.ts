import type { Document, NewDocument } from "../domain/document.ts";
import type { DocumentRepository } from "../ports/document-repository.ts";
import type { EmbeddingPort } from "../ports/embedding-port.ts";

export class IndexDocument {
  constructor(
    private readonly repo: DocumentRepository,
    private readonly embedder: EmbeddingPort,
  ) {}

  async execute(input: NewDocument): Promise<Document> {
    const textForEmbedding = `${input.title}\n\n${input.body}`;
    const embedding = await this.embedder.embed(textForEmbedding);
    return this.repo.insert(input, embedding);
  }
}
