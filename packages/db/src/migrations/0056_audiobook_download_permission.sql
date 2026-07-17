-- Grant the new audiobook:download permission to every role that already has
-- book:download, so existing members keep the download access they had before
-- the permission split. Admins can revoke it per role afterwards.
UPDATE "role"
SET permissions = jsonb_set(
	permissions,
	'{audiobook}',
	COALESCE(permissions -> 'audiobook', '[]'::jsonb) || '["download"]'::jsonb
)
WHERE permissions -> 'book' ? 'download'
	AND NOT COALESCE(permissions -> 'audiobook' ? 'download', false);
