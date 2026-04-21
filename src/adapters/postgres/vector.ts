import type { Embedding } from "../../domain/embedding.ts";

/**
 * pgvector accepts vectors as text in the form '[0.1,0.2,0.3]'.
 * The postgres driver will cast the string to the VECTOR type automatically.
 */
export function toVectorLiteral(e: Embedding): string {
  return `[${e.join(",")}]`;
}
