import type { Document, DocumentId, NewDocument } from "../../domain/document.ts";
import type { Embedding } from "../../domain/embedding.ts";
import type { DocumentRepository } from "../../ports/document-repository.ts";
import type { Sql } from "./client.ts";
import { toVectorLiteral } from "./vector.ts";

interface Row {
  id: number;
  title: string;
  body: string;
  tags: string[];
  created_at: Date;
}

export class PgDocumentRepository implements DocumentRepository {
  constructor(private readonly sql: Sql) {}

  async insert(input: NewDocument, embedding: Embedding): Promise<Document> {
    const [row] = await this.sql<Row[]>`
      INSERT INTO documents (title, body, tags, embedding)
      VALUES (
        ${input.title},
        ${input.body},
        ${this.sql.array(input.tags ?? [])},
        ${toVectorLiteral(embedding)}
      )
      RETURNING id, title, body, tags, created_at
    `;
    return rowToDocument(row!);
  }

  async getById(id: DocumentId): Promise<Document | null> {
    const rows = await this.sql<Row[]>`
      SELECT id, title, body, tags, created_at
      FROM documents
      WHERE id = ${id}
    `;
    return rows[0] ? rowToDocument(rows[0]) : null;
  }

  async count(): Promise<number> {
    const [row] = await this.sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM documents`;
    return Number(row?.count ?? 0);
  }

  async clear(): Promise<void> {
    await this.sql`TRUNCATE documents RESTART IDENTITY`;
  }
}

function rowToDocument(row: Row): Document {
  return {
    id: Number(row.id),
    title: row.title,
    body: row.body,
    tags: row.tags,
    createdAt: row.created_at,
  };
}
