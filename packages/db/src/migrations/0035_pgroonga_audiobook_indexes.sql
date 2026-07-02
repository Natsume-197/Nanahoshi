-- Full-text indexes for audiobook search (previously seq-scanned entirely)
-- plus fixes for the existing book_metadata varchar indexes: pgroonga's
-- default varchar opclass only supports equality, so &@~ on title/subtitle
-- columns never used an index. varchar columns need the explicit
-- full-text opclass; text columns get it by default.
DROP INDEX IF EXISTS pgroonga_am_title;
CREATE INDEX pgroonga_am_title ON audiobook_metadata USING pgroonga (title pgroonga_varchar_full_text_search_ops_v2);
DROP INDEX IF EXISTS pgroonga_am_subtitle;
CREATE INDEX pgroonga_am_subtitle ON audiobook_metadata USING pgroonga (subtitle pgroonga_varchar_full_text_search_ops_v2);
DROP INDEX IF EXISTS pgroonga_am_description;
CREATE INDEX pgroonga_am_description ON audiobook_metadata USING pgroonga (description);
DROP INDEX IF EXISTS pgroonga_narrator_name;
CREATE INDEX pgroonga_narrator_name ON narrator USING pgroonga (name);

DROP INDEX IF EXISTS pgroonga_bm_title;
CREATE INDEX pgroonga_bm_title ON book_metadata USING pgroonga (title pgroonga_varchar_full_text_search_ops_v2);
DROP INDEX IF EXISTS pgroonga_bm_subtitle;
CREATE INDEX pgroonga_bm_subtitle ON book_metadata USING pgroonga (subtitle pgroonga_varchar_full_text_search_ops_v2);
DROP INDEX IF EXISTS pgroonga_bm_title_romaji;
CREATE INDEX pgroonga_bm_title_romaji ON book_metadata USING pgroonga (title_romaji pgroonga_varchar_full_text_search_ops_v2);
