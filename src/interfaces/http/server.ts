import type { Container } from "../../composition-root.ts";
import { handleRequest } from "./routes.ts";

export function createServer(container: Container, port: number) {
  return Bun.serve({
    port,
    fetch(req) {
      return handleRequest(req, container);
    },
  });
}
