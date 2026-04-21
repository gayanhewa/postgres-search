import type { Document, DocumentId, NewDocument } from "../../domain/document.ts";
import type { Embedding } from "../../domain/embedding.ts";
import type { SearchHit, SearchQuery } from "../../domain/search-result.ts";
import type { DocumentRepository } from "../../ports/document-repository.ts";
import type { TextSearchPort } from "../../ports/text-search-port.ts";
import type { VectorSearchPort } from "../../ports/vector-search-port.ts";

interface Stored {
  doc: Document;
  embedding: Embedding;
}

/**
 * Reference implementation used by unit tests.
 * Intentionally naive: linear scan, simple token overlap scoring.
 */
export class InMemoryDocumentStore implements DocumentRepository, TextSearchPort, VectorSearchPort {
  private nextId = 1;
  private readonly rows: Stored[] = [];

  async insert(input: NewDocument, embedding: Embedding): Promise<Document> {
    const doc: Document = {
      id: this.nextId++,
      title: input.title,
      body: input.body,
      tags: input.tags ?? [],
      createdAt: new Date(),
    };
    this.rows.push({ doc, embedding });
    return doc;
  }

  async getById(id: DocumentId): Promise<Document | null> {
    return this.rows.find((r) => r.doc.id === id)?.doc ?? null;
  }

  async count(): Promise<number> {
    return this.rows.length;
  }

  async clear(): Promise<void> {
    this.rows.length = 0;
    this.nextId = 1;
  }

  async search(query: SearchQuery): Promise<SearchHit[]> {
    const terms = query.q.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    const limit = query.limit ?? 20;
    const scored = this.rows
      .map(({ doc }) => {
        const hay = `${doc.title} ${doc.body}`.toLowerCase();
        const score = terms.reduce(
          (acc, t) => acc + (hay.includes(t) ? 1 + (doc.title.toLowerCase().includes(t) ? 0.5 : 0) : 0),
          0,
        );
        return { doc, score };
      })
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map(({ doc, score }) => ({ document: doc, score }));
  }

  async searchByVector(embedding: Embedding, limit = 20): Promise<SearchHit[]> {
    const scored = this.rows
      .map(({ doc, embedding: e }) => ({
        document: doc,
        score: cosineSimilarity(embedding, e),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
