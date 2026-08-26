DELETE FROM "read_listen_match_evaluation" AS "evaluation"
WHERE "evaluation"."proposal_count" > 0
	AND NOT EXISTS (
		SELECT 1
		FROM "read_listen_match_proposal" AS "proposal"
		WHERE "proposal"."server_id" = "evaluation"."server_id"
			AND "proposal"."audiobook_book_id" = "evaluation"."audiobook_book_id"
			AND "proposal"."matcher_version" = "evaluation"."matcher_version"
	)
	AND NOT EXISTS (
		SELECT 1
		FROM "read_listen_pair" AS "pair"
		WHERE "pair"."server_id" = "evaluation"."server_id"
			AND "pair"."audiobook_book_id" = "evaluation"."audiobook_book_id"
	);
