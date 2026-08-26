DELETE FROM "read_listen_match_proposal" AS "proposal"
USING "read_listen_match_decision" AS "decision"
WHERE "decision"."proposal_id" = "proposal"."id"
	AND "decision"."action" IN ('approve', 'correct')
	AND NOT EXISTS (
		SELECT 1
		FROM "read_listen_pair" AS "pair"
		WHERE "pair"."server_id" = "proposal"."server_id"
			AND "pair"."audiobook_book_id" = "proposal"."audiobook_book_id"
			AND "pair"."ebook_book_id" = "decision"."selected_ebook_book_id"
	);
