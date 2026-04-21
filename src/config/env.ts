export interface Env {
  DATABASE_URL: string;
  PORT: number;
  TEST_DB: boolean;
}

export function loadEnv(): Env {
  const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/search";
  const PORT = Number(process.env.PORT ?? 3000);
  const TEST_DB = process.env.TEST_DB === "1" || process.env.TEST_DB === "true";
  return { DATABASE_URL, PORT, TEST_DB };
}
