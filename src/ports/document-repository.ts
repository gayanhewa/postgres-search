import type { Document, DocumentId, NewDocument } from "../domain/document.ts";
import type { Embedding } from "../domain/embedding.ts";

export interface DocumentRepository {
  insert(doc: NewDocument, embedding: Embedding): Promise<Document>;
  getById(id: DocumentId): Promise<Document | null>;
  count(): Promise<number>;
  clear(): Promise<void>;
}
