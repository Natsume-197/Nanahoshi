ALTER TABLE "author" DROP CONSTRAINT "authors_provider_name_key";--> statement-breakpoint
ALTER TABLE "narrator" DROP CONSTRAINT "narrator_name_key";--> statement-breakpoint
ALTER TABLE "author" ADD COLUMN "name_normalized" text GENERATED ALWAYS AS (CASE WHEN normalize(name, NFKC) ~ '[ぁ-ヶー一-龯々〆]' THEN lower(regexp_replace(normalize(name, NFKC), '[[:space:]・·=]+', '', 'g')) ELSE regexp_replace(btrim(normalize(name, NFKC)), '[[:space:]]+', ' ', 'g') END) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "narrator" ADD COLUMN "name_normalized" text GENERATED ALWAYS AS (CASE WHEN normalize(name, NFKC) ~ '[ぁ-ヶー一-龯々〆]' THEN lower(regexp_replace(normalize(name, NFKC), '[[:space:]・·=]+', '', 'g')) ELSE regexp_replace(btrim(normalize(name, NFKC)), '[[:space:]]+', ' ', 'g') END) STORED NOT NULL;--> statement-breakpoint
-- Merge pre-existing duplicates before the unique index can exist. Canonical per
-- (server_id, name_normalized): asin-identified row first (identity hierarchy),
-- then most links, provider preference, lowest id. Rows with their own ASIN are
-- distinct identities (homonyms) and are never merged away.
CREATE TEMP TABLE author_merge_map AS
WITH ranked AS (
	SELECT a.id, a.server_id, a.name_normalized, a.amazon_asin, a.provider,
		(SELECT count(*) FROM book_author ba WHERE ba.author_id = a.id)
		+ (SELECT count(*) FROM audiobook_author aa WHERE aa.author_id = a.id) AS links
	FROM author a
),
canon AS (
	SELECT DISTINCT ON (server_id, name_normalized)
		server_id, name_normalized, id AS canonical_id
	FROM ranked
	ORDER BY server_id, name_normalized,
		(amazon_asin IS NOT NULL) DESC,
		links DESC,
		CASE provider WHEN 'RANOBEDB' THEN 0 WHEN 'AMAZON' THEN 1 ELSE 2 END,
		id
)
SELECT r.id AS dup_id, c.canonical_id
FROM ranked r
JOIN canon c ON c.server_id = r.server_id AND c.name_normalized = r.name_normalized
WHERE r.id <> c.canonical_id AND r.amazon_asin IS NULL;--> statement-breakpoint
INSERT INTO book_author (book_id, author_id, role)
SELECT ba.book_id, m.canonical_id, ba.role
FROM book_author ba JOIN author_merge_map m ON m.dup_id = ba.author_id
ON CONFLICT (book_id, author_id) DO NOTHING;--> statement-breakpoint
DELETE FROM book_author ba USING author_merge_map m WHERE ba.author_id = m.dup_id;--> statement-breakpoint
INSERT INTO audiobook_author (book_id, author_id, role)
SELECT aa.book_id, m.canonical_id, aa.role
FROM audiobook_author aa JOIN author_merge_map m ON m.dup_id = aa.author_id
ON CONFLICT (book_id, author_id) DO NOTHING;--> statement-breakpoint
DELETE FROM audiobook_author aa USING author_merge_map m WHERE aa.author_id = m.dup_id;--> statement-breakpoint
UPDATE author a SET description = d.description
FROM (
	SELECT DISTINCT ON (m.canonical_id) m.canonical_id, dup.description
	FROM author_merge_map m JOIN author dup ON dup.id = m.dup_id
	WHERE dup.description IS NOT NULL
	ORDER BY m.canonical_id, dup.id
) d
WHERE a.id = d.canonical_id AND a.description IS NULL;--> statement-breakpoint
DELETE FROM author a USING author_merge_map m WHERE a.id = m.dup_id;--> statement-breakpoint
DROP TABLE author_merge_map;--> statement-breakpoint
CREATE TEMP TABLE narrator_merge_map AS
WITH ranked AS (
	SELECT n.id, n.server_id, n.name_normalized,
		(SELECT count(*) FROM book_narrator bn WHERE bn.narrator_id = n.id) AS links
	FROM narrator n
),
canon AS (
	SELECT DISTINCT ON (server_id, name_normalized)
		server_id, name_normalized, id AS canonical_id
	FROM ranked
	ORDER BY server_id, name_normalized, links DESC, id
)
SELECT r.id AS dup_id, c.canonical_id
FROM ranked r
JOIN canon c ON c.server_id = r.server_id AND c.name_normalized = r.name_normalized
WHERE r.id <> c.canonical_id;--> statement-breakpoint
INSERT INTO book_narrator (book_id, narrator_id)
SELECT bn.book_id, m.canonical_id
FROM book_narrator bn JOIN narrator_merge_map m ON m.dup_id = bn.narrator_id
ON CONFLICT (book_id, narrator_id) DO NOTHING;--> statement-breakpoint
DELETE FROM book_narrator bn USING narrator_merge_map m WHERE bn.narrator_id = m.dup_id;--> statement-breakpoint
DELETE FROM narrator n USING narrator_merge_map m WHERE n.id = m.dup_id;--> statement-breakpoint
DROP TABLE narrator_merge_map;--> statement-breakpoint
CREATE UNIQUE INDEX "author_server_name_normalized_key" ON "author" USING btree ("server_id","name_normalized") WHERE amazon_asin IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "narrator_server_name_normalized_key" ON "narrator" USING btree ("server_id","name_normalized");