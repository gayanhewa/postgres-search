import type { Embedding } from "../domain/embedding.ts";

export interface EmbeddingPort {
  embed(text: string): Promise<Embedding>;
}
