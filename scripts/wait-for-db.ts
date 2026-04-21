import { createSql } from "../src/adapters/postgres/client.ts";
import { loadEnv } from "../src/config/env.ts";

const env = loadEnv();
const deadline = Date.now() + 30_000;
let lastError: unknown;

while (Date.now() < deadline) {
  const sql = createSql(env.DATABASE_URL);
  try {
    await sql`SELECT 1`;
    await sql.end();
    console.log("postgres is ready");
    process.exit(0);
  } catch (err) {
    lastError = err;
    try { await sql.end({ timeout: 1 }); } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
}

console.error("postgres did not become ready in 30s");
console.error(lastError);
process.exit(1);
