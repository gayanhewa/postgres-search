-- GIN index for full-text search. Required for fast @@ tsquery lookups.
CREATE INDEX IF NOT EXISTS documents_tsv_idx
  ON documents USING GIN (search_tsv);

-- Trigram index on title enables fuzzy ILIKE and similarity() queries.
-- Useful for comparing against tsvector behavior on typos and partial words.
CREATE INDEX IF NOT EXISTS documents_title_trgm_idx
  ON documents USING GIN (title gin_trgm_ops);

-- IVFFlat index for vector cosine distance.
-- Per the pgvector README, lists sizing is `rows / 1000` for up to 1M rows
-- and `sqrt(rows)` above 1M rows. With ~200 seeded docs that would be tiny,
-- so we use 100 as a teaching default and reindex after the seed step for
-- better recall.
-- IVFFlat has a k-means training step, so it is only effective AFTER the
-- table has data. HNSW does not have this constraint; it can be created on
-- an empty table.
CREATE INDEX IF NOT EXISTS documents_embedding_idx
  ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
