UPDATE "book_metadata"
SET "title" = regexp_replace(
	regexp_replace(replace("title", E'\\', '/'), '^.*/', ''),
	'\.(epub|mobi|azw3?|fb2|pdf|cb[rz7])$',
	'',
	'i'
)
WHERE "title" ~ '^(?:[A-Za-z]:[\\/]|/)';
--> statement-breakpoint
UPDATE "audiobook_metadata"
SET "title" = regexp_replace(
	regexp_replace(replace("title", E'\\', '/'), '^.*/', ''),
	'\.(m4[ab]|mp3|ogg|opus|flac|wav|aac)$',
	'',
	'i'
)
WHERE "title" ~ '^(?:[A-Za-z]:[\\/]|/)';
