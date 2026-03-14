-- PGroonga extension and full-text search indexes
CREATE EXTENSION IF NOT EXISTS pgroonga;

CREATE INDEX pgroonga_bm_title ON book_metadata USING pgroonga (title);
CREATE INDEX pgroonga_bm_description ON book_metadata USING pgroonga (description);
CREATE INDEX pgroonga_bm_subtitle ON book_metadata USING pgroonga (subtitle);
CREATE INDEX pgroonga_bm_title_romaji ON book_metadata USING pgroonga (title_romaji);
CREATE INDEX pgroonga_author_name ON author USING pgroonga (name);
