# Postgres Search Playground: Plan

A self-contained learning project to explore two Postgres search techniques side by side:

1. **Full-text search** with `tsvector` / `tsquery`
2. **Vector similarity search** with `pgvector`

The goal is to be able to run the same queries through both engines, compare results, and build an intuition for how each behaves.

## Stack

- **Runtime**: Bun (handles TS natively, ships with a test runner and HTTP server)
- **Language**: TypeScript (strict)
- **DB**: Postgres 16 with `pgvector` and `pg_trgm` extensions, run via Docker Compose
- **Postgres client**: `postgres` (porsager/postgres) for ergonomic tagged-template queries
- **Seeding**: `@faker-js/faker`
- **Web layer**: Bun's native `Bun.serve`
- **Views**: EJS templates
- **UI interactivity**: Alpine.js from CDN
- **Tests**: `bun:test`

## Architecture (ports and adapters)

```
src/
  domain/            # Entities, value objects. No external deps.
    document.ts
    search-result.ts
  ports/             # Interfaces the core depends on.
    document-repository.ts
    text-search-port.ts
    vector-search-port.ts
    embedding-port.ts
  application/       # Use cases wiring ports together.
    index-document.ts
    search-by-text.ts
    search-by-vector.ts
    hybrid-search.ts
  adapters/
    postgres/
      client.ts
      document-repository.pg.ts
      text-search.pg.ts
      vector-search.pg.ts
    embedding/
      deterministic-fake-embedding.ts   # hash-based pseudo embedding so we do not need API keys
    inmemory/
      document-repository.memory.ts     # used in unit tests
  interfaces/
    http/
      server.ts        # Bun.serve
      routes.ts
      views/           # ejs templates
  config/
    env.ts
  composition-root.ts  # builds adapters and wires them into use cases
  index.ts             # entrypoint
scripts/
  seed.ts              # faker-driven seeding
  migrate.ts           # runs sql/*.sql in order
sql/
  001_init.sql
  002_indexes.sql
tests/
  domain/
  application/
  adapters/           # integration (TEST_DB only)
```

### Key rules

- `domain` and `application` import only from `ports` and `domain`. No Postgres, no HTTP, no EJS in those directories.
- `adapters` implement `ports`. They are the only place that talks to real I/O.
- `composition-root.ts` is the single place allowed to import concrete adapters and inject them into use cases.
- `interfaces/http` depends on `application`, not directly on adapters.

## Data model

A single `documents` table to start with. Keeping it simple so the learning focus is on the search primitives, not modeling.

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE documents (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  search_tsv  TSVECTOR GENERATED ALWAYS AS (
                setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(body,  '')), 'B')
              ) STORED,
  embedding   VECTOR(128),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX documents_tsv_idx ON documents USING GIN (search_tsv);
CREATE INDEX documents_trgm_idx ON documents USING GIN (title gin_trgm_ops);
CREATE INDEX documents_embedding_idx ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

Using a 128-dim embedding keeps the fake embedding adapter cheap and the index small.

## Embeddings without an API key

Use a deterministic hashed bag-of-words embedding: tokenize text, hash each token into one of N buckets, L2 normalize. Same text always produces the same vector, similar texts share buckets. This is a teaching tool, not a real model, and that tradeoff is documented in the README.

## HTTP surface

- `GET /` renders the EJS search page (Alpine for the query box + results panel)
- `GET /api/search?q=...` tsvector + ts_rank
- `GET /api/vector?q=...` cosine similarity via `<=>`
- `GET /api/hybrid?q=...` weighted blend of the two
- `GET /api/explain?q=...` returns the raw SQL and plan for each engine so the user can see what is running

## Tests

- Unit tests on domain and application use cases using the in-memory repo
- Integration tests for the Postgres adapters, gated by `TEST_DB` env var so they only run when a container is up

## Execution plan

1. Write `PLAN.md` (this file)
2. Configure Claude setup: `CLAUDE.md`, `.claude/settings.json`
3. Scaffold Bun + TS project, deps, tsconfig
4. Docker Compose + init SQL
5. Implement domain, ports, in-memory adapter, use cases
6. Implement Postgres adapters + embedding adapter
7. HTTP + EJS UI
8. Seed script
9. Tests
10. README
11. Verify: typecheck, tests, bring up Docker, run migrations, seed, curl each endpoint
