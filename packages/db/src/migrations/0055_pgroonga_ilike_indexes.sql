-- ILIKE '%q%' acceleration for the catalog quick-search. PGroonga only serves
-- LIKE/ILIKE through full-text indexes on *text* columns, so the varchar title
-- columns get expression indexes over title::text; filename is already text.
-- Queries must compare via (column::text) ILIKE for the expression indexes to
-- apply (see quickSearchSql in book.repository).
CREATE INDEX pgroonga_bm_title_text ON book_metadata USING pgroonga ((title::text));
CREATE INDEX pgroonga_am_title_text ON audiobook_metadata USING pgroonga ((title::text));
CREATE INDEX pgroonga_book_filename ON book USING pgroonga (filename);
