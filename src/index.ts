import { buildContainer } from "./composition-root.ts";
import { loadEnv } from "./config/env.ts";
import { createServer } from "./interfaces/http/server.ts";

const env = loadEnv();
const container = buildContainer();
const server = createServer(container, env.PORT);

console.log(`postgres-search listening on http://localhost:${server.port}`);
