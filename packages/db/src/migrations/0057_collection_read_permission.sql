-- collection:read was introduced after collection management permissions.
-- Preserve access for existing roles that could already manage collections;
-- roles without collection access remain unchanged.
UPDATE "role"
SET permissions = jsonb_set(
	permissions,
	'{collection}',
	COALESCE(permissions -> 'collection', '[]'::jsonb) || '["read"]'::jsonb
)
WHERE COALESCE(permissions -> 'collection', '[]'::jsonb)
		?| ARRAY['create', 'update', 'delete', 'makePublic']
	AND NOT COALESCE(permissions -> 'collection' ? 'read', false);
