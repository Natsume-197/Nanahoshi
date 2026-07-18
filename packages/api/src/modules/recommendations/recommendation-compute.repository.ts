import { db } from "@nanahoshi-v2/db";
import {
	itemSimilarity,
	userMix,
	userRecommendation,
	userRecState,
	workEmbedding,
	workPopularity,
} from "@nanahoshi-v2/db/schema/recommendations";
import { and, eq, sql } from "drizzle-orm";
import type { PopularityEntry } from "./popularity";
import { isGenericRecommendationTerm } from "./taxonomy";
import { recommendationTitleKey } from "./title-dedup";
import type { ScoredPair, WorkAggregate, WorkKind } from "./types";
import { parseWorkKey } from "./types";

const INSERT_BATCH = 1000;

const userIdList = (userIds: string[]) =>
	sql.join(
		userIds.map((id) => sql`${id}`),
		sql`, `,
	);
// item_similarity rows are small (9 params each) — larger batches stay well
// under the 65535-param protocol limit and cut round-trips on big catalogs
const SIMILARITY_INSERT_BATCH = 4000;

/** Members with at least one signal that can influence a personalized feed. */
const activeOrgUserIds = (serverId: string) => sql`
	SELECT lb.user_id FROM liked_book lb
		WHERE lb.server_id = ${serverId}
	UNION
	SELECT rp.user_id FROM reading_progress rp
		JOIN book b ON b.id = rp.book_id
		JOIN library l ON l.id = b.library_id
		WHERE l.server_id = ${serverId}
			AND (rp.status <> 'unread' OR coalesce(rp.explored_char_count, 0) > 0)
	UNION
	SELECT lp.user_id FROM listening_progress lp
		JOIN book b ON b.id = lp.book_id
		JOIN library l ON l.id = b.library_id
		WHERE l.server_id = ${serverId}
			AND (lp.status <> 'unstarted' OR coalesce(lp.current_time_seconds, 0) > 0)
	UNION
	SELECT ubs.user_id FROM user_book_shelf ubs
		JOIN book b ON b.id = ubs.book_id
		JOIN library l ON l.id = b.library_id
		WHERE l.server_id = ${serverId}
	UNION
	SELECT uas.user_id FROM user_audiobook_shelf uas
		JOIN book b ON b.id = uas.book_id
		JOIN library l ON l.id = b.library_id
		WHERE l.server_id = ${serverId}
	UNION
	SELECT urf.user_id FROM user_recommendation_feedback urf
		WHERE urf.server_id = ${serverId}
`;

type AggRow = {
	kind: WorkKind;
	id: number;
	authorIds: number[] | null;
	genreTerms: { id: number | string; name: string }[] | null;
	tagTerms: { id: number | string; name: string }[] | null;
	publisherIds: number[] | null;
	languageCode: string | null;
	memberBookIds: number[];
	title: string | null;
	subtitle: string | null;
	description: string | null;
	authorNames: string[] | null;
	likedUserIds: string[] | null;
	completedUserIds: string[] | null;
	shelfUserIds: string[] | null;
	amazonRating: number | null;
	amazonReviewCount: number | null;
	createdAt: string | null;
};

export class RecommendationComputeRepository {
	/**
	 * Load all works of a server: each series (spanning both formats) plus each
	 * standalone canonical book, with unioned signal sets and engagement.
	 * Org-wide on purpose — per-user library permissions are applied at read time.
	 */
	async loadWorkAggregates(serverId: string): Promise<WorkAggregate[]> {
		// canonical visible books of the org, tagged with their series (if any)
		const result = await db.execute(sql`
			WITH org_books AS (
				SELECT b.id, bs.series_id AS book_series_id, abs2.series_id AS audio_series_id
				FROM book b
				JOIN library l ON l.id = b.library_id
				LEFT JOIN book_series bs ON bs.book_id = b.id
				LEFT JOIN audiobook_series abs2 ON abs2.book_id = b.id
				WHERE l.server_id = ${serverId} AND b.duplicate_of_book_id IS NULL
			),
			works AS (
				SELECT 'series'::text AS kind, series_id AS item_id, array_agg(id ORDER BY id) AS member_book_ids
				FROM (
					SELECT id, COALESCE(book_series_id, audio_series_id) AS series_id FROM org_books
				) x WHERE series_id IS NOT NULL
				GROUP BY series_id
				UNION ALL
				SELECT 'book'::text, id, ARRAY[id]
				FROM org_books WHERE book_series_id IS NULL AND audio_series_id IS NULL
			)
			SELECT
				w.kind,
				w.item_id AS id,
				w.member_book_ids AS "memberBookIds",
				(SELECT s.name FROM series s WHERE w.kind = 'series' AND s.id = w.item_id) AS series_name,
				agg.*
			FROM works w
			CROSS JOIN LATERAL (
				SELECT
					(SELECT array_agg(DISTINCT x) FROM (
						SELECT ba.author_id AS x FROM book_author ba
							WHERE ba.book_id = ANY(w.member_book_ids)
								AND (ba.role IS NULL OR lower(trim(ba.role)) IN ('author', 'writer', '著', '著者', '原作'))
						UNION SELECT aa.author_id FROM audiobook_author aa
							WHERE aa.book_id = ANY(w.member_book_ids)
								AND (aa.role IS NULL OR lower(trim(aa.role)) IN ('author', 'writer', '著', '著者', '原作'))
					) t) AS "authorIds",
					(SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY id) FROM (
						SELECT DISTINCT g.id, g.name FROM genre g WHERE g.id IN (
							SELECT bg.genre_id FROM book_genre bg WHERE bg.book_id = ANY(w.member_book_ids)
							UNION SELECT ag.genre_id FROM audiobook_genre ag WHERE ag.book_id = ANY(w.member_book_ids)
						)
					) t) AS "genreTerms",
					(SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY id) FROM (
						SELECT DISTINCT tg.id, tg.name FROM tag tg WHERE tg.id IN (
							SELECT bt.tag_id FROM book_tag bt WHERE bt.book_id = ANY(w.member_book_ids)
							UNION SELECT at2.tag_id FROM audiobook_tag at2 WHERE at2.book_id = ANY(w.member_book_ids)
						)
					) t) AS "tagTerms",
					(SELECT array_agg(DISTINCT x) FROM (
						SELECT bm.publisher_id AS x FROM book_metadata bm
							WHERE bm.book_id = ANY(w.member_book_ids) AND bm.publisher_id IS NOT NULL
						UNION SELECT am.publisher_id FROM audiobook_metadata am
							WHERE am.book_id = ANY(w.member_book_ids) AND am.publisher_id IS NOT NULL
					) t) AS "publisherIds",
					(SELECT mode() WITHIN GROUP (ORDER BY lang) FROM (
						SELECT bm.language_code AS lang FROM book_metadata bm
							WHERE bm.book_id = ANY(w.member_book_ids) AND bm.language_code IS NOT NULL
						UNION ALL SELECT am.language_code FROM audiobook_metadata am
							WHERE am.book_id = ANY(w.member_book_ids) AND am.language_code IS NOT NULL
					) t) AS "languageCode",
					(SELECT COALESCE(bm.title, am.title) FROM unnest(w.member_book_ids) member(book_id)
						LEFT JOIN book_metadata bm ON bm.book_id = member.book_id
						LEFT JOIN audiobook_metadata am ON am.book_id = member.book_id
						LEFT JOIN book_series bs ON w.kind = 'series' AND bs.series_id = w.item_id
							AND bs.book_id = member.book_id
						LEFT JOIN audiobook_series aus ON w.kind = 'series' AND aus.series_id = w.item_id
							AND aus.book_id = member.book_id
						WHERE COALESCE(bm.title, am.title) IS NOT NULL
						ORDER BY COALESCE(bs.position, aus.position) ASC NULLS LAST, member.book_id LIMIT 1) AS title,
					(SELECT COALESCE(bm.subtitle, am.subtitle) FROM unnest(w.member_book_ids) member(book_id)
						LEFT JOIN book_metadata bm ON bm.book_id = member.book_id
						LEFT JOIN audiobook_metadata am ON am.book_id = member.book_id
						LEFT JOIN book_series bs ON w.kind = 'series' AND bs.series_id = w.item_id
							AND bs.book_id = member.book_id
						LEFT JOIN audiobook_series aus ON w.kind = 'series' AND aus.series_id = w.item_id
							AND aus.book_id = member.book_id
						WHERE COALESCE(bm.subtitle, am.subtitle) IS NOT NULL
						ORDER BY COALESCE(bs.position, aus.position) ASC NULLS LAST, member.book_id LIMIT 1) AS subtitle,
					(SELECT COALESCE(bm.description, am.description) FROM unnest(w.member_book_ids) member(book_id)
						LEFT JOIN book_metadata bm ON bm.book_id = member.book_id
						LEFT JOIN audiobook_metadata am ON am.book_id = member.book_id
						LEFT JOIN book_series bs ON w.kind = 'series' AND bs.series_id = w.item_id
							AND bs.book_id = member.book_id
						LEFT JOIN audiobook_series aus ON w.kind = 'series' AND aus.series_id = w.item_id
							AND aus.book_id = member.book_id
						WHERE COALESCE(bm.description, am.description) IS NOT NULL
						ORDER BY COALESCE(bs.position, aus.position) ASC NULLS LAST, member.book_id LIMIT 1) AS description,
					(SELECT array_agg(DISTINCT a.name) FROM author a WHERE a.id IN (
						SELECT ba.author_id FROM book_author ba WHERE ba.book_id = ANY(w.member_book_ids)
							AND (ba.role IS NULL OR lower(trim(ba.role)) IN ('author', 'writer', '著', '著者', '原作'))
						UNION SELECT aa.author_id FROM audiobook_author aa WHERE aa.book_id = ANY(w.member_book_ids)
							AND (aa.role IS NULL OR lower(trim(aa.role)) IN ('author', 'writer', '著', '著者', '原作'))
					)) AS "authorNames",
					(SELECT array_agg(DISTINCT lb.user_id) FROM liked_book lb
						WHERE lb.book_id = ANY(w.member_book_ids)) AS "likedUserIds",
					(SELECT array_agg(DISTINCT user_id) FROM (
						SELECT rp.user_id FROM reading_progress rp
							WHERE rp.book_id = ANY(w.member_book_ids) AND rp.status = 'completed'
						UNION SELECT lp.user_id FROM listening_progress lp
							WHERE lp.book_id = ANY(w.member_book_ids) AND lp.status = 'completed'
					) t) AS "completedUserIds",
					(SELECT array_agg(DISTINCT user_id) FROM (
						SELECT ubs.user_id FROM user_book_shelf ubs WHERE ubs.book_id = ANY(w.member_book_ids)
						UNION SELECT uas.user_id FROM user_audiobook_shelf uas WHERE uas.book_id = ANY(w.member_book_ids)
					) t) AS "shelfUserIds",
					(SELECT max(bm.amazon_rating) FROM book_metadata bm
						WHERE bm.book_id = ANY(w.member_book_ids)) AS "amazonRating",
					(SELECT max(bm.amazon_review_count) FROM book_metadata bm
						WHERE bm.book_id = ANY(w.member_book_ids)) AS "amazonReviewCount",
					(SELECT max(b2.created_at) FROM book b2 WHERE b2.id = ANY(w.member_book_ids)) AS "createdAt"
			) agg
		`);

		return (
			result.rows as unknown as (AggRow & { series_name: string | null })[]
		).map((row) => {
			const genreTerms = (row.genreTerms ?? []).filter(
				(term) => !isGenericRecommendationTerm(term.name),
			);
			const tagTerms = (row.tagTerms ?? []).filter(
				(term) => !isGenericRecommendationTerm(term.name),
			);
			const titleParts = [
				row.series_name ?? row.title,
				row.subtitle,
				(row.authorNames ?? []).join(" "),
				genreTerms.map((term) => term.name).join(" "),
				tagTerms.map((term) => term.name).join(" "),
				row.description?.slice(0, 1000),
			].filter(Boolean);
			const liked = row.likedUserIds ?? [];
			const completed = row.completedUserIds ?? [];
			return {
				kind: row.kind,
				id: Number(row.id),
				authorIds: new Set((row.authorIds ?? []).map(Number)),
				genreIds: new Set(genreTerms.map((term) => Number(term.id))),
				tagIds: new Set(tagTerms.map((term) => Number(term.id))),
				publisherIds: new Set((row.publisherIds ?? []).map(Number)),
				languageCode: row.languageCode,
				memberBookIds: row.memberBookIds.map(Number),
				embeddingText: titleParts.join(" "),
				engagedUserIds: new Set([
					...liked,
					...completed,
					...(row.shelfUserIds ?? []),
				]),
				likeCount: liked.length,
				completionCount: completed.length,
				amazonRating:
					row.amazonRating === null ? null : Number(row.amazonRating),
				amazonReviewCount:
					row.amazonReviewCount === null ? null : Number(row.amazonReviewCount),
				createdAtMs: row.createdAt ? new Date(row.createdAt).getTime() : 0,
			} satisfies WorkAggregate;
		});
	}

	// ---------- fingerprints ----------

	/**
	 * Stable checksum of every catalog field that affects recommendation inputs.
	 * Join tables have composite primary keys and metadata rows have no updated_at,
	 * so count/max fingerprints miss in-place edits and relationship swaps.
	 */
	async computeCatalogFingerprint(serverId: string): Promise<string> {
		const result = await db.execute(sql`
			WITH org_books AS (
				SELECT b.* FROM book b JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId}
			)
			SELECT
				(SELECT md5(coalesce(string_agg(md5(concat_ws('|', id, library_id,
					media_type, filehash, duplicate_of_book_id, last_modified)), ',' ORDER BY id), ''))
					FROM org_books) AS books,
				(SELECT md5(coalesce(string_agg(md5(concat_ws('|', bm.book_id, bm.title,
					bm.subtitle, bm.description, bm.language_code, bm.publisher_id,
					bm.amazon_rating, bm.amazon_review_count)), ',' ORDER BY bm.book_id), ''))
					FROM book_metadata bm JOIN org_books ob ON ob.id = bm.book_id) AS book_meta,
				(SELECT md5(coalesce(string_agg(md5(concat_ws('|', am.book_id, am.title,
					am.subtitle, am.description, am.language_code, am.publisher_id)),
					',' ORDER BY am.book_id), '')) FROM audiobook_metadata am
					JOIN org_books ob ON ob.id = am.book_id) AS audio_meta,
				(SELECT md5(coalesce(string_agg(concat_ws('|', bs.book_id, bs.series_id,
					bs.position), ',' ORDER BY bs.book_id, bs.series_id), '')) FROM book_series bs
					JOIN org_books ob ON ob.id = bs.book_id) AS b_series,
				(SELECT md5(coalesce(string_agg(concat_ws('|', as2.book_id, as2.series_id,
					as2.position), ',' ORDER BY as2.book_id, as2.series_id), '')) FROM audiobook_series as2
					JOIN org_books ob ON ob.id = as2.book_id) AS a_series,
				(SELECT md5(coalesce(string_agg(concat_ws('|', ba.book_id, ba.author_id, ba.role),
					',' ORDER BY ba.book_id, ba.author_id), '')) FROM book_author ba
					JOIN org_books ob ON ob.id = ba.book_id) AS b_author,
				(SELECT md5(coalesce(string_agg(concat_ws('|', aa.book_id, aa.author_id, aa.role),
					',' ORDER BY aa.book_id, aa.author_id), '')) FROM audiobook_author aa
					JOIN org_books ob ON ob.id = aa.book_id) AS a_author,
				(SELECT md5(coalesce(string_agg(concat_ws('|', bg.book_id, bg.genre_id),
					',' ORDER BY bg.book_id, bg.genre_id), '')) FROM book_genre bg
					JOIN org_books ob ON ob.id = bg.book_id) AS b_genre,
				(SELECT md5(coalesce(string_agg(concat_ws('|', ag.book_id, ag.genre_id),
					',' ORDER BY ag.book_id, ag.genre_id), '')) FROM audiobook_genre ag
					JOIN org_books ob ON ob.id = ag.book_id) AS a_genre,
				(SELECT md5(coalesce(string_agg(concat_ws('|', bt.book_id, bt.tag_id),
					',' ORDER BY bt.book_id, bt.tag_id), '')) FROM book_tag bt
					JOIN org_books ob ON ob.id = bt.book_id) AS b_tag,
				(SELECT md5(coalesce(string_agg(concat_ws('|', at2.book_id, at2.tag_id),
					',' ORDER BY at2.book_id, at2.tag_id), '')) FROM audiobook_tag at2
					JOIN org_books ob ON ob.id = at2.book_id) AS a_tag,
				(SELECT md5(coalesce(string_agg(concat_ws('|', s.id, s.name, s.description),
					',' ORDER BY s.id), '')) FROM series s WHERE s.server_id = ${serverId}) AS series,
				(SELECT md5(coalesce(string_agg(concat_ws('|', a.id, a.name), ',' ORDER BY a.id), ''))
					FROM author a WHERE a.server_id = ${serverId}) AS authors,
				(SELECT md5(coalesce(string_agg(concat_ws('|', g.id, g.name), ',' ORDER BY g.id), ''))
					FROM genre g WHERE g.server_id = ${serverId}) AS genres,
				(SELECT md5(coalesce(string_agg(concat_ws('|', t.id, t.name), ',' ORDER BY t.id), ''))
					FROM tag t WHERE t.server_id = ${serverId}) AS tags,
				(SELECT md5(coalesce(string_agg(concat_ws('|', p.id, p.name), ',' ORDER BY p.id), ''))
					FROM publisher p WHERE p.server_id = ${serverId}) AS publishers
		`);
		return JSON.stringify(result.rows[0] ?? {});
	}

	async computeEngagementFingerprint(serverId: string): Promise<string> {
		const result = await db.execute(sql`
			SELECT
				(SELECT concat(count(*), ':', coalesce(max(extract(epoch from lb.created_at)::bigint), 0))
					FROM liked_book lb WHERE lb.server_id = ${serverId}) AS likes,
				(SELECT concat(count(*), ':', coalesce(max(extract(epoch from rp.last_read_at)::bigint), 0))
					FROM reading_progress rp JOIN book b ON b.id = rp.book_id
					JOIN library l ON l.id = b.library_id WHERE l.server_id = ${serverId}) AS reading,
				(SELECT concat(count(*), ':', coalesce(max(extract(epoch from lp.last_listened_at)::bigint), 0))
					FROM listening_progress lp JOIN book b ON b.id = lp.book_id
					JOIN library l ON l.id = b.library_id WHERE l.server_id = ${serverId}) AS listening,
				(SELECT concat(count(*), ':', coalesce(max(extract(epoch from ubs.updated_at)::bigint), 0))
					FROM user_book_shelf ubs JOIN book b ON b.id = ubs.book_id
					JOIN library l ON l.id = b.library_id WHERE l.server_id = ${serverId}) AS b_shelf,
				(SELECT concat(count(*), ':', coalesce(max(extract(epoch from uas.updated_at)::bigint), 0))
					FROM user_audiobook_shelf uas JOIN book b ON b.id = uas.book_id
					JOIN library l ON l.id = b.library_id WHERE l.server_id = ${serverId}) AS a_shelf
		`);
		return JSON.stringify(result.rows[0] ?? {});
	}

	async computeUserSignalsFingerprint(
		serverId: string,
		userId: string,
	): Promise<string> {
		const result = await db.execute(sql`
			SELECT
				(SELECT concat(count(*), ':', coalesce(max(extract(epoch from lb.created_at)::bigint), 0))
					FROM liked_book lb WHERE lb.server_id = ${serverId} AND lb.user_id = ${userId}) AS likes,
				(SELECT concat(count(*), ':', coalesce(max(extract(epoch from rp.last_read_at)::bigint), 0), ':',
						count(*) FILTER (WHERE rp.status = 'completed'))
					FROM reading_progress rp JOIN book b ON b.id = rp.book_id
					JOIN library l ON l.id = b.library_id
					WHERE l.server_id = ${serverId} AND rp.user_id = ${userId}) AS reading,
				(SELECT concat(count(*), ':', coalesce(max(extract(epoch from lp.last_listened_at)::bigint), 0), ':',
						count(*) FILTER (WHERE lp.status = 'completed'))
					FROM listening_progress lp JOIN book b ON b.id = lp.book_id
					JOIN library l ON l.id = b.library_id
					WHERE l.server_id = ${serverId} AND lp.user_id = ${userId}) AS listening,
				(SELECT concat(count(*), ':', coalesce(max(extract(epoch from ubs.updated_at)::bigint), 0))
					FROM user_book_shelf ubs JOIN book b ON b.id = ubs.book_id
					JOIN library l ON l.id = b.library_id
					WHERE l.server_id = ${serverId} AND ubs.user_id = ${userId}) AS b_shelf,
				(SELECT concat(count(*), ':', coalesce(max(extract(epoch from uas.updated_at)::bigint), 0))
					FROM user_audiobook_shelf uas JOIN book b ON b.id = uas.book_id
					JOIN library l ON l.id = b.library_id
					WHERE l.server_id = ${serverId} AND uas.user_id = ${userId}) AS a_shelf,
			(SELECT concat(count(*), ':', coalesce(max(extract(epoch from urf.created_at)::bigint), 0))
				FROM user_recommendation_feedback urf
				WHERE urf.server_id = ${serverId} AND urf.user_id = ${userId}) AS feedback,
			-- abandoned transitions purely by elapsed time; count it so the nightly
			-- rebuild's skip-if-unchanged recomputes once a read crosses the threshold
			(SELECT count(*) FROM reading_progress rp
				JOIN book b ON b.id = rp.book_id JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND rp.user_id = ${userId}
					AND rp.status <> 'completed' AND coalesce(rp.book_char_count, 0) > 0
					AND rp.explored_char_count::float / rp.book_char_count >= 0.05
					AND rp.explored_char_count::float / rp.book_char_count < 0.40
					AND coalesce(rp.last_read_at, rp.created_at) < now() - interval '60 days') AS r_abandoned,
			(SELECT count(*) FROM listening_progress lp
				JOIN book b ON b.id = lp.book_id JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND lp.user_id = ${userId}
					AND lp.status <> 'completed' AND coalesce(lp.duration_seconds, 0) > 0
					AND lp.current_time_seconds::float / lp.duration_seconds >= 0.05
					AND lp.current_time_seconds::float / lp.duration_seconds < 0.40
					AND coalesce(lp.last_listened_at, lp.created_at) < now() - interval '60 days') AS l_abandoned
		`);
		return JSON.stringify(result.rows[0] ?? {});
	}

	/**
	 * Batch variant of computeUserSignalsFingerprint: one grouped query per
	 * signal source instead of eight scalar subqueries per user. Every value is
	 * assembled to the exact string the per-user version yields (including the
	 * key order of the JSON), so stored fingerprints stay comparable.
	 */
	async computeUserSignalsFingerprintsBatch(
		serverId: string,
		userIds: string[],
	): Promise<Map<string, string>> {
		if (userIds.length === 0) return new Map();
		const grouped = async (query: ReturnType<typeof sql>) => {
			const result = await db.execute(query);
			return new Map(
				(result.rows as unknown as { uid: string; v: string }[]).map((r) => [
					r.uid,
					String(r.v),
				]),
			);
		};
		const [
			likes,
			reading,
			listening,
			bShelf,
			aShelf,
			feedback,
			rAbandoned,
			lAbandoned,
		] = await Promise.all([
			grouped(sql`
				SELECT lb.user_id AS uid, concat(count(*), ':', coalesce(max(extract(epoch from lb.created_at)::bigint), 0)) AS v
				FROM liked_book lb
				WHERE lb.server_id = ${serverId} AND lb.user_id IN (${userIdList(userIds)})
				GROUP BY lb.user_id`),
			grouped(sql`
				SELECT rp.user_id AS uid, concat(count(*), ':', coalesce(max(extract(epoch from rp.last_read_at)::bigint), 0), ':',
						count(*) FILTER (WHERE rp.status = 'completed')) AS v
				FROM reading_progress rp JOIN book b ON b.id = rp.book_id
				JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND rp.user_id IN (${userIdList(userIds)})
				GROUP BY rp.user_id`),
			grouped(sql`
				SELECT lp.user_id AS uid, concat(count(*), ':', coalesce(max(extract(epoch from lp.last_listened_at)::bigint), 0), ':',
						count(*) FILTER (WHERE lp.status = 'completed')) AS v
				FROM listening_progress lp JOIN book b ON b.id = lp.book_id
				JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND lp.user_id IN (${userIdList(userIds)})
				GROUP BY lp.user_id`),
			grouped(sql`
				SELECT ubs.user_id AS uid, concat(count(*), ':', coalesce(max(extract(epoch from ubs.updated_at)::bigint), 0)) AS v
				FROM user_book_shelf ubs JOIN book b ON b.id = ubs.book_id
				JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND ubs.user_id IN (${userIdList(userIds)})
				GROUP BY ubs.user_id`),
			grouped(sql`
				SELECT uas.user_id AS uid, concat(count(*), ':', coalesce(max(extract(epoch from uas.updated_at)::bigint), 0)) AS v
				FROM user_audiobook_shelf uas JOIN book b ON b.id = uas.book_id
				JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND uas.user_id IN (${userIdList(userIds)})
				GROUP BY uas.user_id`),
			grouped(sql`
				SELECT urf.user_id AS uid, concat(count(*), ':', coalesce(max(extract(epoch from urf.created_at)::bigint), 0)) AS v
				FROM user_recommendation_feedback urf
				WHERE urf.server_id = ${serverId} AND urf.user_id IN (${userIdList(userIds)})
				GROUP BY urf.user_id`),
			grouped(sql`
				SELECT rp.user_id AS uid, count(*)::text AS v FROM reading_progress rp
				JOIN book b ON b.id = rp.book_id JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND rp.user_id IN (${userIdList(userIds)})
					AND rp.status <> 'completed' AND coalesce(rp.book_char_count, 0) > 0
					AND rp.explored_char_count::float / rp.book_char_count >= 0.05
					AND rp.explored_char_count::float / rp.book_char_count < 0.40
					AND coalesce(rp.last_read_at, rp.created_at) < now() - interval '60 days'
				GROUP BY rp.user_id`),
			grouped(sql`
				SELECT lp.user_id AS uid, count(*)::text AS v FROM listening_progress lp
				JOIN book b ON b.id = lp.book_id JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND lp.user_id IN (${userIdList(userIds)})
					AND lp.status <> 'completed' AND coalesce(lp.duration_seconds, 0) > 0
					AND lp.current_time_seconds::float / lp.duration_seconds >= 0.05
					AND lp.current_time_seconds::float / lp.duration_seconds < 0.40
					AND coalesce(lp.last_listened_at, lp.created_at) < now() - interval '60 days'
				GROUP BY lp.user_id`),
		]);
		const out = new Map<string, string>();
		for (const userId of userIds) {
			out.set(
				userId,
				JSON.stringify({
					likes: likes?.get(userId) ?? "0:0",
					reading: reading?.get(userId) ?? "0:0:0",
					listening: listening?.get(userId) ?? "0:0:0",
					b_shelf: bShelf?.get(userId) ?? "0:0",
					a_shelf: aShelf?.get(userId) ?? "0:0",
					feedback: feedback?.get(userId) ?? "0:0",
					r_abandoned: rAbandoned?.get(userId) ?? "0",
					l_abandoned: lAbandoned?.get(userId) ?? "0",
				}),
			);
		}
		return out;
	}

	// ---------- embeddings ----------

	async loadEmbeddingHashes(serverId: string): Promise<Map<string, string>> {
		const rows = await db
			.select({
				kind: workEmbedding.kind,
				itemId: workEmbedding.itemId,
				inputHash: workEmbedding.inputHash,
			})
			.from(workEmbedding)
			.where(eq(workEmbedding.serverId, serverId));
		return new Map(rows.map((r) => [`${r.kind}:${r.itemId}`, r.inputHash]));
	}

	async loadEmbeddings(
		serverId: string,
	): Promise<{ kind: WorkKind; itemId: number; vector: number[] }[]> {
		return db
			.select({
				kind: workEmbedding.kind,
				itemId: workEmbedding.itemId,
				vector: workEmbedding.vector,
			})
			.from(workEmbedding)
			.where(eq(workEmbedding.serverId, serverId));
	}

	/** Committed per batch by the caller — first-time embedding is resumable. */
	async upsertEmbeddings(
		serverId: string,
		rows: {
			kind: WorkKind;
			itemId: number;
			vector: number[];
			inputHash: string;
			model: string;
		}[],
	) {
		if (rows.length === 0) return;
		await db
			.insert(workEmbedding)
			.values(rows.map((r) => ({ ...r, serverId })))
			.onConflictDoUpdate({
				target: [
					workEmbedding.serverId,
					workEmbedding.kind,
					workEmbedding.itemId,
				],
				set: {
					vector: sql`excluded.vector`,
					inputHash: sql`excluded.input_hash`,
					model: sql`excluded.model`,
					computedAt: sql`now()`,
				},
			});
	}

	async deleteStaleEmbeddings(serverId: string, keepKeys: Set<string>) {
		const rows = await db
			.select({ kind: workEmbedding.kind, itemId: workEmbedding.itemId })
			.from(workEmbedding)
			.where(eq(workEmbedding.serverId, serverId));
		const stale = rows.filter((r) => !keepKeys.has(`${r.kind}:${r.itemId}`));
		for (let i = 0; i < stale.length; i += INSERT_BATCH) {
			const chunk = stale.slice(i, i + INSERT_BATCH);
			await db.delete(workEmbedding).where(
				and(
					eq(workEmbedding.serverId, serverId),
					sql`(${workEmbedding.kind}, ${workEmbedding.itemId}) IN (${sql.join(
						chunk.map((r) => sql`(${r.kind}::work_kind, ${r.itemId})`),
						sql`, `,
					)})`,
				),
			);
		}
	}

	// ---------- replace operations ----------

	async replaceSimilarities(serverId: string, pairs: ScoredPair[]) {
		await db.transaction(async (tx) => {
			await tx
				.delete(itemSimilarity)
				.where(eq(itemSimilarity.serverId, serverId));
			for (let i = 0; i < pairs.length; i += SIMILARITY_INSERT_BATCH) {
				await tx.insert(itemSimilarity).values(
					pairs.slice(i, i + SIMILARITY_INSERT_BATCH).map((p) => {
						const seed = parseWorkKey(p.seed);
						const cand = parseWorkKey(p.cand);
						return {
							serverId,
							seedKind: seed.kind,
							seedId: seed.id,
							candKind: cand.kind,
							candId: cand.id,
							score: p.score,
							components: p.components,
							reason: p.reason,
						};
					}),
				);
			}
		});
	}

	async replacePopularity(serverId: string, entries: PopularityEntry[]) {
		await db.transaction(async (tx) => {
			await tx
				.delete(workPopularity)
				.where(eq(workPopularity.serverId, serverId));
			for (let i = 0; i < entries.length; i += INSERT_BATCH) {
				await tx.insert(workPopularity).values(
					entries.slice(i, i + INSERT_BATCH).map((e) => ({
						serverId,
						kind: e.kind,
						itemId: e.id,
						likeCount: e.likeCount,
						completionCount: e.completionCount,
						engagedUserCount: e.engagedUserCount,
						amazonRating: e.amazonRating,
						amazonReviewCount: e.amazonReviewCount,
						score: e.score,
					})),
				);
			}
		});
	}

	async replaceUserRecommendations(
		serverId: string,
		userId: string,
		mixes: {
			mixIndex: number;
			anchorKind: WorkKind | null;
			anchorId: number | null;
			items: {
				kind: WorkKind;
				itemId: number;
				score: number;
				rank: number;
				reason: ScoredPair["reason"];
				reasonKind: WorkKind | null;
				reasonId: number | null;
				components: Record<string, number>;
			}[];
		}[],
		signalsFp: string,
	) {
		await db.transaction(async (tx) => {
			await tx
				.delete(userMix)
				.where(and(eq(userMix.serverId, serverId), eq(userMix.userId, userId)));
			await tx
				.delete(userRecommendation)
				.where(
					and(
						eq(userRecommendation.serverId, serverId),
						eq(userRecommendation.userId, userId),
					),
				);
			if (mixes.length > 0) {
				await tx.insert(userMix).values(
					mixes.map((m) => ({
						serverId,
						userId,
						mixIndex: m.mixIndex,
						anchorKind: m.anchorKind,
						anchorId: m.anchorId,
					})),
				);
				const items = mixes.flatMap((m) =>
					m.items.map((it) => ({ ...it, mixIndex: m.mixIndex })),
				);
				for (let i = 0; i < items.length; i += INSERT_BATCH) {
					await tx.insert(userRecommendation).values(
						items.slice(i, i + INSERT_BATCH).map((it) => ({
							serverId,
							userId,
							kind: it.kind,
							itemId: it.itemId,
							mixIndex: it.mixIndex,
							score: it.score,
							rank: it.rank,
							reason: it.reason,
							reasonKind: it.reasonKind,
							reasonId: it.reasonId,
							components: it.components,
						})),
					);
				}
			}
			await tx
				.insert(userRecState)
				.values({ serverId, userId, signalsFp })
				.onConflictDoUpdate({
					target: [userRecState.serverId, userRecState.userId],
					set: { signalsFp, computedAt: sql`now()` },
				});
		});
	}

	async getUserRecState(
		serverId: string,
		userId: string,
	): Promise<string | null> {
		const [row] = await db
			.select({ signalsFp: userRecState.signalsFp })
			.from(userRecState)
			.where(
				and(
					eq(userRecState.serverId, serverId),
					eq(userRecState.userId, userId),
				),
			)
			.limit(1);
		return row?.signalsFp ?? null;
	}

	async getUserRecStates(
		serverId: string,
		userIds: string[],
	): Promise<Map<string, string>> {
		if (userIds.length === 0) return new Map();
		const rows = await db
			.select({
				userId: userRecState.userId,
				signalsFp: userRecState.signalsFp,
			})
			.from(userRecState)
			.where(
				and(
					eq(userRecState.serverId, serverId),
					sql`${userRecState.userId} IN (${userIdList(userIds)})`,
				),
			);
		return new Map(rows.map((r) => [r.userId, r.signalsFp]));
	}

	async listActiveOrgMemberIds(serverId: string): Promise<string[]> {
		const result = await db.execute(sql`
			SELECT DISTINCT m.user_id AS id
			FROM member m
			JOIN (${activeOrgUserIds(serverId)}) active ON active.user_id = m.user_id
			WHERE m.organization_id = ${serverId}
			ORDER BY m.user_id
		`);
		return (result.rows as unknown as { id: string }[]).map((r) => r.id);
	}

	async listOrganizationIds(): Promise<string[]> {
		const result = await db.execute(
			sql`SELECT o.id FROM organization o ORDER BY o.id`,
		);
		return (result.rows as unknown as { id: string }[]).map((r) => r.id);
	}

	/** Drops rec rows of users who are no longer members of the org. */
	async pruneNonMemberRecommendations(serverId: string): Promise<void> {
		const memberSql = sql`SELECT m.user_id FROM member m WHERE m.organization_id = ${serverId}`;
		await db.execute(sql`
			DELETE FROM user_recommendation ur
			WHERE ur.server_id = ${serverId} AND ur.user_id NOT IN (${memberSql})
		`);
		await db.execute(sql`
			DELETE FROM user_mix um
			WHERE um.server_id = ${serverId} AND um.user_id NOT IN (${memberSql})
		`);
		await db.execute(sql`
			DELETE FROM user_rec_state urs
			WHERE urs.server_id = ${serverId} AND urs.user_id NOT IN (${memberSql})
		`);
	}

	// ---------- per-user feed inputs (from persisted tables, cheap) ----------

	/** User signals mapped to work keys in SQL — bounded by the user's history size. */
	async loadUserSignalWorks(
		serverId: string,
		userId: string,
	): Promise<
		{ kind: WorkKind; itemId: number; signal: string; atMs: number }[]
	> {
		const result = await db.execute(sql`
			WITH events AS (
				SELECT lb.book_id, 'like' AS signal, lb.created_at AS at
				FROM liked_book lb WHERE lb.server_id = ${serverId} AND lb.user_id = ${userId}
				UNION ALL
				SELECT rp.book_id,
					CASE WHEN rp.status = 'completed' THEN 'completed'
						WHEN coalesce(rp.book_char_count, 0) > 0
							AND rp.explored_char_count::float / rp.book_char_count >= 0.5 THEN 'progress50'
						WHEN coalesce(rp.book_char_count, 0) > 0
							AND rp.explored_char_count::float / rp.book_char_count >= 0.05
							AND rp.explored_char_count::float / rp.book_char_count < 0.40
							AND coalesce(rp.last_read_at, rp.created_at) < now() - interval '60 days'
							THEN 'abandoned'
						ELSE 'progress' END,
					coalesce(rp.completed_at, rp.last_read_at, rp.created_at)
				FROM reading_progress rp
				JOIN book b ON b.id = rp.book_id JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND rp.user_id = ${userId}
					AND (rp.status <> 'unread' OR coalesce(rp.explored_char_count, 0) > 0)
				UNION ALL
				SELECT lp.book_id,
					CASE WHEN lp.status = 'completed' THEN 'completed'
						WHEN coalesce(lp.duration_seconds, 0) > 0
							AND lp.current_time_seconds / lp.duration_seconds >= 0.5 THEN 'progress50'
						WHEN coalesce(lp.duration_seconds, 0) > 0
							AND lp.current_time_seconds::float / lp.duration_seconds >= 0.05
							AND lp.current_time_seconds::float / lp.duration_seconds < 0.40
							AND coalesce(lp.last_listened_at, lp.created_at) < now() - interval '60 days'
							THEN 'abandoned'
						ELSE 'progress' END,
					coalesce(lp.completed_at, lp.last_listened_at, lp.created_at)
				FROM listening_progress lp
				JOIN book b ON b.id = lp.book_id JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND lp.user_id = ${userId}
					AND (lp.status <> 'unstarted' OR coalesce(lp.current_time_seconds, 0) > 0)
				UNION ALL
				SELECT ubs.book_id,
					CASE WHEN ubs.status = 'completed' THEN 'completed'
						WHEN ubs.status = 'want_to_read' THEN 'shelf_want'
						ELSE 'shelf' END,
					ubs.updated_at
				FROM user_book_shelf ubs
				JOIN book b ON b.id = ubs.book_id JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND ubs.user_id = ${userId}
				UNION ALL
				SELECT uas.book_id,
					CASE WHEN uas.status = 'completed' THEN 'completed'
						WHEN uas.status = 'want_to_listen' THEN 'shelf_want'
						ELSE 'shelf' END,
					uas.updated_at
				FROM user_audiobook_shelf uas
				JOIN book b ON b.id = uas.book_id JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND uas.user_id = ${userId}
			)
			SELECT
				CASE WHEN COALESCE(bs.series_id, as2.series_id) IS NOT NULL THEN 'series' ELSE 'book' END AS kind,
				COALESCE(bs.series_id, as2.series_id, canon.id) AS "itemId",
				e.signal,
				extract(epoch from e.at) * 1000 AS "atMs"
			FROM events e
			JOIN book b0 ON b0.id = e.book_id
			JOIN book canon ON canon.id = COALESCE(b0.duplicate_of_book_id, b0.id)
			LEFT JOIN book_series bs ON bs.book_id = canon.id
			LEFT JOIN audiobook_series as2 ON as2.book_id = canon.id
			UNION ALL
			-- explicit "not interested": already work-level, no book→series collapse needed
			SELECT urf.kind::text AS kind, urf.item_id AS "itemId", urf.type::text AS signal,
				extract(epoch from urf.created_at) * 1000 AS "atMs"
			FROM user_recommendation_feedback urf
			WHERE urf.server_id = ${serverId} AND urf.user_id = ${userId}
		`);
		return (
			result.rows as unknown as {
				kind: WorkKind;
				itemId: string | number;
				signal: string;
				atMs: string | number;
			}[]
		).map((r) => ({
			kind: r.kind,
			itemId: Number(r.itemId),
			signal: r.signal,
			atMs: Number(r.atMs ?? 0),
		}));
	}

	/**
	 * Batch variant of loadUserSignalWorks: same event branches with the user
	 * filter widened to a set, grouped in JS. Row content per user is identical.
	 */
	async loadUserSignalWorksBatch(
		serverId: string,
		userIds: string[],
	): Promise<
		Map<
			string,
			{ kind: WorkKind; itemId: number; signal: string; atMs: number }[]
		>
	> {
		const out = new Map<
			string,
			{ kind: WorkKind; itemId: number; signal: string; atMs: number }[]
		>();
		if (userIds.length === 0) return out;
		const result = await db.execute(sql`
			WITH events AS (
				SELECT lb.user_id, lb.book_id, 'like' AS signal, lb.created_at AS at
				FROM liked_book lb WHERE lb.server_id = ${serverId} AND lb.user_id IN (${userIdList(userIds)})
				UNION ALL
				SELECT rp.user_id, rp.book_id,
					CASE WHEN rp.status = 'completed' THEN 'completed'
						WHEN coalesce(rp.book_char_count, 0) > 0
							AND rp.explored_char_count::float / rp.book_char_count >= 0.5 THEN 'progress50'
						WHEN coalesce(rp.book_char_count, 0) > 0
							AND rp.explored_char_count::float / rp.book_char_count >= 0.05
							AND rp.explored_char_count::float / rp.book_char_count < 0.40
							AND coalesce(rp.last_read_at, rp.created_at) < now() - interval '60 days'
							THEN 'abandoned'
						ELSE 'progress' END,
					coalesce(rp.completed_at, rp.last_read_at, rp.created_at)
				FROM reading_progress rp
				JOIN book b ON b.id = rp.book_id JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND rp.user_id IN (${userIdList(userIds)})
					AND (rp.status <> 'unread' OR coalesce(rp.explored_char_count, 0) > 0)
				UNION ALL
				SELECT lp.user_id, lp.book_id,
					CASE WHEN lp.status = 'completed' THEN 'completed'
						WHEN coalesce(lp.duration_seconds, 0) > 0
							AND lp.current_time_seconds / lp.duration_seconds >= 0.5 THEN 'progress50'
						WHEN coalesce(lp.duration_seconds, 0) > 0
							AND lp.current_time_seconds::float / lp.duration_seconds >= 0.05
							AND lp.current_time_seconds::float / lp.duration_seconds < 0.40
							AND coalesce(lp.last_listened_at, lp.created_at) < now() - interval '60 days'
							THEN 'abandoned'
						ELSE 'progress' END,
					coalesce(lp.completed_at, lp.last_listened_at, lp.created_at)
				FROM listening_progress lp
				JOIN book b ON b.id = lp.book_id JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND lp.user_id IN (${userIdList(userIds)})
					AND (lp.status <> 'unstarted' OR coalesce(lp.current_time_seconds, 0) > 0)
				UNION ALL
				SELECT ubs.user_id, ubs.book_id,
					CASE WHEN ubs.status = 'completed' THEN 'completed'
						WHEN ubs.status = 'want_to_read' THEN 'shelf_want'
						ELSE 'shelf' END,
					ubs.updated_at
				FROM user_book_shelf ubs
				JOIN book b ON b.id = ubs.book_id JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND ubs.user_id IN (${userIdList(userIds)})
				UNION ALL
				SELECT uas.user_id, uas.book_id,
					CASE WHEN uas.status = 'completed' THEN 'completed'
						WHEN uas.status = 'want_to_listen' THEN 'shelf_want'
						ELSE 'shelf' END,
					uas.updated_at
				FROM user_audiobook_shelf uas
				JOIN book b ON b.id = uas.book_id JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND uas.user_id IN (${userIdList(userIds)})
			)
			SELECT
				e.user_id AS "userId",
				CASE WHEN COALESCE(bs.series_id, as2.series_id) IS NOT NULL THEN 'series' ELSE 'book' END AS kind,
				COALESCE(bs.series_id, as2.series_id, canon.id) AS "itemId",
				e.signal,
				extract(epoch from e.at) * 1000 AS "atMs"
			FROM events e
			JOIN book b0 ON b0.id = e.book_id
			JOIN book canon ON canon.id = COALESCE(b0.duplicate_of_book_id, b0.id)
			LEFT JOIN book_series bs ON bs.book_id = canon.id
			LEFT JOIN audiobook_series as2 ON as2.book_id = canon.id
			UNION ALL
			SELECT urf.user_id AS "userId", urf.kind::text AS kind, urf.item_id AS "itemId",
				urf.type::text AS signal, extract(epoch from urf.created_at) * 1000 AS "atMs"
			FROM user_recommendation_feedback urf
			WHERE urf.server_id = ${serverId} AND urf.user_id IN (${userIdList(userIds)})
		`);
		for (const r of result.rows as unknown as {
			userId: string;
			kind: WorkKind;
			itemId: string | number;
			signal: string;
			atMs: string | number;
		}[]) {
			let list = out.get(r.userId);
			if (!list) {
				list = [];
				out.set(r.userId, list);
			}
			list.push({
				kind: r.kind,
				itemId: Number(r.itemId),
				signal: r.signal,
				atMs: Number(r.atMs ?? 0),
			});
		}
		return out;
	}

	/** Whole item_similarity table of the org, grouped per seed at the call site. */
	async loadAllSimilarities(serverId: string): Promise<
		{
			seedKind: WorkKind;
			seedId: number;
			candKind: WorkKind;
			candId: number;
			score: number;
			components: Record<string, number>;
			reason: string;
		}[]
	> {
		const result = await db.execute(sql`
			SELECT seed_kind AS "seedKind", seed_id AS "seedId", cand_kind AS "candKind",
				cand_id AS "candId", score, components, reason
			FROM item_similarity
			WHERE server_id = ${serverId}
			ORDER BY seed_kind, seed_id, score DESC
		`);
		return (
			result.rows as unknown as {
				seedKind: WorkKind;
				seedId: string | number;
				candKind: WorkKind;
				candId: string | number;
				score: number;
				components: Record<string, number>;
				reason: string;
			}[]
		).map((r) => ({
			...r,
			seedId: Number(r.seedId),
			candId: Number(r.candId),
			score: Number(r.score),
		}));
	}

	async loadSimilaritiesForSeeds(
		serverId: string,
		seeds: { kind: WorkKind; id: number }[],
	): Promise<
		{
			seedKind: WorkKind;
			seedId: number;
			candKind: WorkKind;
			candId: number;
			score: number;
			components: Record<string, number>;
			reason: string;
		}[]
	> {
		if (seeds.length === 0) return [];
		const result = await db.execute(sql`
			SELECT seed_kind AS "seedKind", seed_id AS "seedId", cand_kind AS "candKind",
				cand_id AS "candId", score, components, reason
			FROM item_similarity
			WHERE server_id = ${serverId}
				AND (seed_kind, seed_id) IN (${sql.join(
					seeds.map((s) => sql`(${s.kind}::work_kind, ${s.id})`),
					sql`, `,
				)})
			ORDER BY seed_kind, seed_id, score DESC
		`);
		return (
			result.rows as unknown as {
				seedKind: WorkKind;
				seedId: string | number;
				candKind: WorkKind;
				candId: string | number;
				score: number;
				components: Record<string, number>;
				reason: string;
			}[]
		).map((r) => ({
			...r,
			seedId: Number(r.seedId),
			candId: Number(r.candId),
			score: Number(r.score),
		}));
	}

	async loadPopularityOrdered(
		serverId: string,
		limit = 500,
	): Promise<{ kind: WorkKind; itemId: number; score: number }[]> {
		const rows = await db
			.select({
				kind: workPopularity.kind,
				itemId: workPopularity.itemId,
				score: workPopularity.score,
			})
			.from(workPopularity)
			.where(eq(workPopularity.serverId, serverId))
			.orderBy(sql`${workPopularity.score} DESC`, workPopularity.itemId)
			.limit(limit);
		return rows.map((r) => ({ ...r, itemId: Number(r.itemId) }));
	}

	async countPopularityWorks(serverId: string): Promise<number> {
		const [row] = await db
			.select({ count: sql<number>`count(*)` })
			.from(workPopularity)
			.where(eq(workPopularity.serverId, serverId));
		return Number(row?.count ?? 0);
	}

	async loadEmbeddingsByKeys(
		serverId: string,
		keys: { kind: WorkKind; id: number }[],
	): Promise<{ kind: WorkKind; itemId: number; vector: number[] }[]> {
		if (keys.length === 0) return [];
		return db
			.select({
				kind: workEmbedding.kind,
				itemId: workEmbedding.itemId,
				vector: workEmbedding.vector,
			})
			.from(workEmbedding)
			.where(
				and(
					eq(workEmbedding.serverId, serverId),
					sql`(${workEmbedding.kind}, ${workEmbedding.itemId}) IN (${sql.join(
						keys.map((k) => sql`(${k.kind}::work_kind, ${k.id})`),
						sql`, `,
					)})`,
				),
			);
	}

	async loadRecommendationTitleKeys(
		serverId: string,
		keys: { kind: WorkKind; id: number }[],
	): Promise<Map<string, string>> {
		if (keys.length === 0) return new Map();
		const seriesIds = keys
			.filter((key) => key.kind === "series")
			.map((key) => key.id);
		const bookIds = keys
			.filter((key) => key.kind === "book")
			.map((key) => key.id);
		const rows: { kind: WorkKind; id: string | number; title: string }[] = [];
		if (seriesIds.length > 0) {
			const result = await db.execute(sql`
				SELECT 'series' AS kind, s.id, s.name AS title FROM series s
				WHERE s.server_id = ${serverId} AND s.id IN (${sql.join(
					seriesIds.map((id) => sql`${id}`),
					sql`, `,
				)})
			`);
			rows.push(...(result.rows as unknown as typeof rows));
		}
		if (bookIds.length > 0) {
			const result = await db.execute(sql`
				SELECT 'book' AS kind, b.id, COALESCE(bm.title, am.title, b.filename) AS title
				FROM book b JOIN library l ON l.id = b.library_id
				LEFT JOIN book_metadata bm ON bm.book_id = b.id
				LEFT JOIN audiobook_metadata am ON am.book_id = b.id
				WHERE l.server_id = ${serverId} AND b.id IN (${sql.join(
					bookIds.map((id) => sql`${id}`),
					sql`, `,
				)})
			`);
			rows.push(...(result.rows as unknown as typeof rows));
		}
		return new Map(
			rows.map((row) => [
				`${row.kind}:${Number(row.id)}`,
				recommendationTitleKey(row.title),
			]),
		);
	}

	/**
	 * Primary author per work (min author id of the work's books) for diversity
	 * caps. Series/book ids are globally unique, so no server filter is needed.
	 */
	async loadPrimaryAuthors(
		_serverId: string,
		keys: { kind: WorkKind; id: number }[],
	): Promise<Map<string, number>> {
		if (keys.length === 0) return new Map();
		const seriesIds = keys.filter((k) => k.kind === "series").map((k) => k.id);
		const bookIds = keys.filter((k) => k.kind === "book").map((k) => k.id);
		const rows: unknown[] = [];
		if (seriesIds.length > 0) {
			const result = await db.execute(sql`
				SELECT 'series' AS kind, x.series_id AS id, min(x.author_id) AS author_id FROM (
					SELECT bs.series_id, ba.author_id FROM book_series bs
						JOIN book_author ba ON ba.book_id = bs.book_id
						WHERE bs.series_id IN (${sql.join(
							seriesIds.map((id) => sql`${id}`),
							sql`, `,
						)}) AND (ba.role IS NULL OR lower(trim(ba.role)) IN ('author', 'writer', '著', '著者', '原作'))
					UNION ALL
					SELECT as2.series_id, aa.author_id FROM audiobook_series as2
						JOIN audiobook_author aa ON aa.book_id = as2.book_id
						WHERE as2.series_id IN (${sql.join(
							seriesIds.map((id) => sql`${id}`),
							sql`, `,
						)}) AND (aa.role IS NULL OR lower(trim(aa.role)) IN ('author', 'writer', '著', '著者', '原作'))
				) x GROUP BY x.series_id
			`);
			rows.push(...result.rows);
		}
		if (bookIds.length > 0) {
			const result = await db.execute(sql`
				SELECT 'book' AS kind, y.book_id AS id, min(y.author_id) AS author_id FROM (
					SELECT ba.book_id, ba.author_id FROM book_author ba
						WHERE ba.book_id IN (${sql.join(
							bookIds.map((id) => sql`${id}`),
							sql`, `,
						)}) AND (ba.role IS NULL OR lower(trim(ba.role)) IN ('author', 'writer', '著', '著者', '原作'))
					UNION ALL
					SELECT aa.book_id, aa.author_id FROM audiobook_author aa
						WHERE aa.book_id IN (${sql.join(
							bookIds.map((id) => sql`${id}`),
							sql`, `,
						)}) AND (aa.role IS NULL OR lower(trim(aa.role)) IN ('author', 'writer', '著', '著者', '原作'))
				) y GROUP BY y.book_id
			`);
			rows.push(...result.rows);
		}
		const map = new Map<string, number>();
		for (const row of rows as {
			kind: WorkKind;
			id: string | number;
			author_id: string | number;
		}[]) {
			map.set(`${row.kind}:${Number(row.id)}`, Number(row.author_id));
		}
		return map;
	}
}

export const recommendationComputeRepository =
	new RecommendationComputeRepository();
