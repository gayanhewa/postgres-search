import type { Embedding } from "../../domain/embedding.ts";
import type { SearchHit } from "../../domain/search-result.ts";
import type { VectorSearchPort } from "../../ports/vector-search-port.ts";
import type { Sql } from "./client.ts";
import { toVectorLiteral } from "./vector.ts";

interface Row {
  id: number;
  title: string;
  body: string;
  tags: string[];
  created_at: Date;
  distance: number;
}

/**
 * Vector similarity with pgvector.
 *
 * Operators:
 *   <->  L2 distance
 *   <=>  cosine distance (1 - cosine similarity)
 *   <#>  negative inner product
 *
 * We use cosine distance because our embeddings are L2 normalized; cosine
 * is then equivalent to dot product but is the conventional choice.
 *
 * To make the score directionality match text search (higher = better),
 * we return `1 - distance` as the score (i.e. cosine similarity).
 */
export class PgVectorSearch implements VectorSearchPort {
  constructor(private readonly sql: Sql) {}

  async searchByVector(embedding: Embedding, limit = 20): Promise<SearchHit[]> {
    const vec = toVectorLiteral(embedding);
    const rows = await this.sql<Row[]>`
      SELECT
        id,
        title,
        body,
        tags,
        created_at,
        (embedding <=> ${vec}::vector) AS distance
      FROM documents
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${limit}
    `;

    const queryNorm = l2Norm(embedding);
    const topQueryDims = pickTopDims(embedding, 5);

    return rows.map((r) => {
      const distance = Number(r.distance);
      const similarity = 1 - distance;
      return {
        document: {
          id: Number(r.id),
          title: r.title,
          body: r.body,
          tags: r.tags,
          createdAt: r.created_at,
        },
        score: similarity,
        details: {
          kind: "pgvector" as const,
          cosineDistance: distance,
          cosineSimilarity: similarity,
          queryNorm,
          topQueryDims,
        },
      };
    });
  }
}

function l2Norm(v: number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

function pickTopDims(v: number[], k: number): Array<{ dim: number; value: number }> {
  return v
    .map((value, dim) => ({ dim, value }))
    .filter((d) => d.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, k);
}
