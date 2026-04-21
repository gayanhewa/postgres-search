# postgres-search

A learning playground for Postgres `tsvector`/`tsquery` and `pgvector`, behind a TypeScript + Bun app with an EJS + Alpine UI.

## Purpose

The codebase is intentionally small and heavily commented in the places where search behavior is non-obvious (ranking, operators, index trade-offs). When changing search logic, preserve or improve those explanations so the project keeps its teaching value.

## Stack

- Bun (runtime, test runner, HTTP server)
- TypeScript, strict mode
- Postgres 16 + `pgvector` + `pg_trgm` via Docker Compose
- `postgres` (porsager/postgres) client
- EJS + Alpine.js for the UI
- `@faker-js/faker` for seeded data

## Architecture: ports and adapters

Directory layout is load-bearing. Respect it:

```
src/
  domain/            pure types, no I/O
  ports/             interfaces only
  application/       use cases; depends on ports only
  adapters/          implementations of ports (postgres, inmemory, embedding)
  interfaces/http/   Bun.serve, routes, EJS views
  composition-root.ts   the ONLY file allowed to import both adapters and use cases
```

Rules:

- `domain` and `application` must not import from `adapters` or `interfaces`.
- `adapters` must not import from `interfaces`.
- Do not import concrete adapters from use cases. Depend on port interfaces.
- Wiring happens in `composition-root.ts`. If you need a different adapter (e.g. in-memory for tests), swap it there.

## Commands

- `bun install` - install deps
- `bun run dev` - start the HTTP server with hot reload
- `bun run typecheck` - `tsc --noEmit`
- `bun test` - unit tests (no DB required)
- `bun test:integration` - integration tests (requires `TEST_DB` and a running Postgres)
- `bun run db:up` - start Postgres via docker compose
- `bun run db:down` - stop Postgres
- `bun run db:migrate` - apply SQL files in `sql/` in order
- `bun run db:seed` - insert faker-generated documents with tsvector + embeddings
- `bun run db:reset` - down, up, migrate, seed

## Conventions

- No emdashes in prose or comments.
- Comments explain *why*, not *what*. The exception: search-related SQL and ranking formulas get a short explanation since this is a learning tool.
- Avoid adding features, tables, or abstractions that are not needed for the current experiment.
- Tests: unit tests use the in-memory adapter; integration tests hit real Postgres and must be idempotent.
- No AI attribution in commit messages. Conventional commits.

## When editing search code

Changes to tsvector config (language, weights, `to_tsvector` calls) or vector config (distance operator, index type, dimensions) affect results across the whole app. If you change one, update:

1. `sql/` migration files
2. The matching adapter in `src/adapters/postgres/`
3. The README section that explains the chosen defaults
