import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSql } from "../src/adapters/postgres/client.ts";
import { loadEnv } from "../src/config/env.ts";

const env = loadEnv();
const sql = createSql(env.DATABASE_URL);

const dir = join(process.cwd(), "sql");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

for (const file of files) {
  const full = join(dir, file);
  const content = await readFile(full, "utf8");
  console.log(`applying ${file}`);
  await sql.unsafe(content);
}

console.log(`applied ${files.length} migration(s)`);
await sql.end();
