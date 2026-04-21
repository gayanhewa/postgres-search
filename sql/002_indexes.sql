-- GIN index for full-text search. Required for fast @@ tsquery lookups.
CREATE INDEX IF NOT EXISTS documents_tsv_idx
  ON documents USING GIN (search_tsv);

-- Trigram index on title enables fuzzy ILIKE and similarity() queries.
-- Useful for comparing against tsvector behavior on typos and partial words.
CREATE INDEX IF NOT EXISTS documents_title_trgm_idx
  ON documents USING GIN (title gin_trgm_ops);

-- IVFFlat index for vector cosine distance.
-- lists = sqrt(rows) is a reasonable starting point. Rebuild after large loads.
-- Must be built AFTER data is loaded to be effective; we (re)create it in the
-- seed step. Creating an empty one here is harmless.
CREATE INDEX IF NOT EXISTS documents_embedding_idx
  ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
