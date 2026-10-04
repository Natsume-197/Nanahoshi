-- Likes are gone; existing ones move into a manual "Likes" collection per user
-- and server, and dynamic rules on `liked` point at that collection instead.
CREATE TEMP TABLE "likes_collection_map" AS
SELECT gen_random_uuid() AS "id", "user_id", "server_id"
FROM (
	SELECT "user_id", "server_id" FROM "liked_book"
	UNION
	SELECT "user_id", "server_id" FROM "collection"
	WHERE "kind" = 'dynamic'
		AND jsonb_path_exists("dynamic_definition", '$.** ? (@.field == "liked")')
) AS "owners";
--> statement-breakpoint
INSERT INTO "collection" ("id", "user_id", "server_id", "name", "kind")
SELECT "id", "user_id", "server_id", 'Likes', 'manual' FROM "likes_collection_map";
--> statement-breakpoint
INSERT INTO "collection_book" ("collection_id", "book_id", "added_at")
SELECT m."id", lb."book_id", lb."created_at"
FROM "liked_book" lb
INNER JOIN "likes_collection_map" m
	ON m."user_id" = lb."user_id" AND m."server_id" = lb."server_id";
--> statement-breakpoint
CREATE FUNCTION "nanahoshi_rewrite_liked_rules"("node" jsonb, "likes_ref" jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
	IF node->>'kind' = 'group' THEN
		RETURN jsonb_set(node, '{children}', COALESCE((
			SELECT jsonb_agg(nanahoshi_rewrite_liked_rules(child, likes_ref) ORDER BY ord)
			FROM jsonb_array_elements(node->'children') WITH ORDINALITY AS c(child, ord)
		), '[]'::jsonb));
	ELSIF node->>'field' = 'liked' THEN
		RETURN jsonb_build_object(
			'kind', 'rule',
			'field', 'manualCollection',
			'operator', CASE WHEN node->>'operator' = 'isFalse' THEN 'excludesAll' ELSE 'includesAny' END,
			'value', jsonb_build_array(likes_ref)
		);
	END IF;
	RETURN node;
END;
$$;
--> statement-breakpoint
UPDATE "collection" c
SET "dynamic_definition" = jsonb_set(
	c."dynamic_definition",
	'{root}',
	nanahoshi_rewrite_liked_rules(
		c."dynamic_definition"->'root',
		jsonb_build_object('id', m."id", 'label', 'Likes')
	)
)
FROM "likes_collection_map" m
WHERE c."kind" = 'dynamic'
	AND m."user_id" = c."user_id"
	AND m."server_id" = c."server_id"
	AND jsonb_path_exists(c."dynamic_definition", '$.** ? (@.field == "liked")');
--> statement-breakpoint
DROP FUNCTION "nanahoshi_rewrite_liked_rules"(jsonb, jsonb);
--> statement-breakpoint
DROP TABLE "likes_collection_map";
--> statement-breakpoint
DROP TABLE "liked_book";
--> statement-breakpoint
ALTER TYPE "public"."recommendation_reason" RENAME VALUE 'because_you_liked' TO 'because_you_saved';
--> statement-breakpoint
ALTER TABLE "work_popularity" RENAME COLUMN "like_count" TO "collection_count";
--> statement-breakpoint
UPDATE "role" SET "permissions" = "permissions" - 'like' WHERE "permissions" ? 'like';
--> statement-breakpoint
UPDATE "library_permission_overwrite" SET "allow" = "allow" - 'like', "deny" = "deny" - 'like'
WHERE "allow" ? 'like' OR "deny" ? 'like';
