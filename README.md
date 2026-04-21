# postgres-search

A self-contained playground for learning two Postgres search techniques side by side:

1. **Full-text search** with `tsvector` / `tsquery`
2. **Vector similarity search** with `pgvector`

You run a single Postgres container, seed it with a mix of curated and faker-generated documents, then hit a small web app that runs the same query through both engines plus a simple hybrid blend. The goal is to build intuition for how each engine behaves and where each one shines.

## What you will learn

- How `to_tsvector`, `tsquery`, and `ts_rank_cd` actually work, including weighted ranking
- The difference between `plainto_tsquery`, `phraseto_tsquery`, and `websearch_to_tsquery`
- How `pgvector` stores embeddings and which distance operator (`<->`, `<=>`, `<#>`) to use when
- Why `GIN`, `IVFFlat`, and `HNSW` indexes exist and what their trade-offs are
- How a naive hybrid score blend changes results versus either engine alone
- Where keyword search wins, where vector search wins, and where they disagree

## Quick start

Prereqs: Docker, [Bun](https://bun.sh).

```bash
cp .env.example .env
bun install
bun run db:up          # starts Postgres 16 + pgvector on port 5433
bun run db:migrate     # applies sql/*.sql
bun run db:seed        # 8 curated docs + 200 faker-generated ones
bun run dev            # http://localhost:3000
```

Or in one shot: `bun run db:reset`.

## What you get

- A browser UI at `http://localhost:3000` that runs your query through all three engines in parallel and shows the top results side by side.
- JSON endpoints for scripting experiments:
  - `GET /api/search?q=...` uses `websearch_to_tsquery` + `ts_rank_cd`
  - `GET /api/vector?q=...` cosine distance via `<=>`
  - `GET /api/hybrid?q=...` min-max normalized blend of both
- Seed data including curated docs about Postgres indexing, `tsvector`, `pgvector`, ranking, and hybrid retrieval, so the differences between engines are immediately visible.

## Things to try

Run each of these and watch how the three panels disagree:

- `postgres indexing` - both engines agree
- `tsquery` - keyword-only win, tsvector ranks the relevant doc first
- `similarity operator` - the word "operator" pulls in some noise on the text side but the vector side stays on-topic
- `pgvetor` (typo) - keyword search returns nothing because the lexeme does not match. The fake embedding also struggles because it hashes whole tokens, so this is a good prompt to swap in a real embedding adapter and watch the behavior change.
- `what is the best way to search in postgres` - natural-language query; watch the tsquery engine pick on function words while vector still lands in the right neighborhood

## How it works

### Schema

```sql
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
```

Key points:

- `search_tsv` is a **generated column**. You never write to it directly. Postgres keeps it in sync.
- `setweight` tags title lexemes as A and body lexemes as B. `ts_rank_cd` uses those weights to score title matches higher.
- `embedding` is 128 dims because the project uses a toy hashed embedding. Real embeddings are usually 384 to 1536. The operator and index types are the same regardless.

Indexes (in `sql/002_indexes.sql`):

- `documents_tsv_idx` - `GIN` on `search_tsv`. Fast `@@ tsquery` lookups.
- `documents_title_trgm_idx` - `GIN` with `gin_trgm_ops`. Available for fuzzy `ILIKE` and `similarity()` experiments.
- `documents_embedding_idx` - `IVFFlat` with cosine ops. Approximate nearest neighbor.

### Text search adapter

`src/adapters/postgres/text-search.pg.ts` runs roughly:

```sql
SELECT d.*, ts_rank_cd('{0.1, 0.2, 0.4, 1.0}', d.search_tsv, q.tsq) AS score
FROM documents d, (SELECT websearch_to_tsquery('english', $1) AS tsq) q
WHERE d.search_tsv @@ q.tsq
ORDER BY score DESC
```

- `websearch_to_tsquery` accepts quotes, `OR`, and `-` the way a web search box does.
- The weight array `{D, C, B, A}` is how ranking incorporates `setweight`. Tweak it to change how much title matches dominate.

### Vector search adapter

`src/adapters/postgres/vector-search.pg.ts`:

```sql
SELECT d.*, (embedding <=> $1::vector) AS distance
FROM documents
ORDER BY embedding <=> $1::vector
LIMIT $2
```

- `<=>` is cosine distance (`1 - cosine_similarity`). Because our embeddings are L2 normalized, cosine and dot product rank the same.
- The adapter returns `1 - distance` as the score so both engines agree on "higher is better" for the UI.

### Embeddings without an API key

`src/adapters/embedding/deterministic-fake-embedding.ts` implements a hashed bag-of-words + bigram embedding:

1. Tokenize on non-word characters, lowercase, drop very short tokens.
2. Hash each token with FNV-1a and add 1 to that dim.
3. Hash each bigram with a different salt and add 0.5.
4. L2 normalize.

This is not a real semantic embedding. It captures token overlap, not meaning. The README calls that out explicitly so you can tell the difference between "the vector engine is doing something smart" and "the vector engine is just doing token overlap in a different way." If you plug in a real embedding model later (OpenAI, Cohere, a local model via Ollama), the only file that needs to change is this adapter, because it implements the `EmbeddingPort` interface.

## Architecture

The project is organized as ports and adapters (hexagonal):

```
src/
  domain/            pure types. No I/O.
  ports/             interfaces: DocumentRepository, TextSearchPort,
                     VectorSearchPort, EmbeddingPort.
  application/       use cases: IndexDocument, SearchByText,
                     SearchByVector, HybridSearch. Depends on ports only.
  adapters/
    postgres/        PgDocumentRepository, PgTextSearch, PgVectorSearch.
    inmemory/        InMemoryDocumentStore (used in unit tests, also
                     implements TextSearchPort and VectorSearchPort).
    embedding/       DeterministicFakeEmbedding.
  interfaces/http/   Bun.serve server, routes, EJS views.
  composition-root.ts  Wires adapters into use cases. The only file
                       allowed to import both.
```

Rules the project enforces:

- `domain` and `application` never import from `adapters` or `interfaces`. They cannot, by construction, know what backs the ports.
- Use cases take port interfaces, not concrete classes.
- To swap an engine (e.g. OpenSearch instead of tsvector), write a new adapter that implements `TextSearchPort` and change one line in `composition-root.ts`.

## Tests

Unit tests run against the in-memory adapter so they are fast and need no Postgres:

```bash
bun test
```

Integration tests hit real Postgres. Start the DB first, then:

```bash
TEST_DB=1 bun test:integration
```

## Experiments to try

- Change the `ts_rank_cd` weight array in `src/adapters/postgres/text-search.pg.ts` and see how ranking shifts.
- Swap `websearch_to_tsquery` for `plainto_tsquery` and compare. Try a query with a minus sign.
- Change the tsvector language config from `'english'` to `'simple'` in `sql/001_init.sql`. The simple config skips stemming and stop words. Re-run `bun run db:reset` and notice how queries for "indexing" stop matching "index."
- Replace `IVFFlat` with `HNSW` in `sql/002_indexes.sql` (pgvector 0.5+). Compare recall and latency on larger seed sizes (set `SEED_RANDOM_COUNT=10000`).
- Replace the fake embedding with a real one (Ollama, OpenAI). Only `deterministic-fake-embedding.ts` should need to change.
- Change the hybrid weights in `src/application/hybrid-search.ts` or implement reciprocal rank fusion and see how the blended results shift.

## Layout

```
.
├── CLAUDE.md                      guidance for Claude Code
├── PLAN.md                        the plan this project was built from
├── README.md
├── docker-compose.yml             pgvector/pgvector:pg16 on port 5433
├── package.json
├── scripts/
│   ├── migrate.ts
│   ├── seed.ts
│   └── wait-for-db.ts
├── sql/
│   ├── 001_init.sql
│   └── 002_indexes.sql
├── src/
│   ├── adapters/
│   ├── application/
│   ├── composition-root.ts
│   ├── config/env.ts
│   ├── domain/
│   ├── index.ts
│   ├── interfaces/http/
│   └── ports/
└── tests/
    ├── adapters/                  integration tests, TEST_DB=1
    ├── application/
    └── domain/
```
