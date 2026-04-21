-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  -- Generated tsvector: title gets weight A, body gets weight B.
  -- Weights are used later by ts_rank to boost title matches over body matches.
  search_tsv  TSVECTOR GENERATED ALWAYS AS (
                setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(body,  '')), 'B')
              ) STORED,
  -- 128 dims keeps the index small. Real embeddings are typically 384 to 1536.
  embedding   VECTOR(128),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
