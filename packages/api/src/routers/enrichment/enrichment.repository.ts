import { db } from "@nanahoshi-v2/db";
import {
	book,
	type EnrichmentFailure,
	type EnrichmentMatch,
	type EnrichmentStatus,
	enrichmentState,
	library,
} from "@nanahoshi-v2/db/schema/general";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

// Partial matches (a provider matched but critical data like authors is
// missing — usually a transient hiccup) stay retryable across later scans,
// finalizing only once this cap is reached so genuinely incomplete titles
// stop hammering the external APIs.
export const MAX_PARTIAL_ENRICH_ATTEMPTS = 3;

const TERMINAL_STATUSES: EnrichmentStatus[] = [
	"enriched",
	"no_match",
	"review",
];

export type EnrichmentRun = {
	status: EnrichmentStatus;
	matched?: EnrichmentMatch[];
	failures?: EnrichmentFailure[];
	nextRetryAt?: Date | null;
};

// One row per book (ebook or audiobook), provider-agnostic. Replaces the old
// amazon_enriched_at / enriched_at flags: every enrichment run records its
// outcome here, and the worker gates on isTerminal instead of a timestamp.
export class EnrichmentStateRepository {
	async recordRun(bookId: number, run: EnrichmentRun) {
		const values = {
			bookId,
			status: run.status,
			matched: run.matched ?? [],
			failures: run.failures ?? [],
			lastRunAt: sql`now()`,
			nextRetryAt: run.nextRetryAt?.toISOString() ?? null,
		};
		await db
			.insert(enrichmentState)
			.values(values)
			.onConflictDoUpdate({
				target: enrichmentState.bookId,
				set: {
					status: values.status,
					matched: values.matched,
					failures: values.failures,
					lastRunAt: values.lastRunAt,
					nextRetryAt: values.nextRetryAt,
				},
			});
	}

	// A match missing critical data (e.g. author-less audiobook match) counts
	// attempts and finalizes to "enriched" at the cap; below it the row stays
	// "partial" so later scans retry.
	async recordPartialMatch(bookId: number, run: Omit<EnrichmentRun, "status">) {
		const matched = run.matched ?? [];
		const failures = run.failures ?? [];
		const nextRetryAt = run.nextRetryAt?.toISOString() ?? null;
		await db
			.insert(enrichmentState)
			.values({
				bookId,
				status:
					1 >= MAX_PARTIAL_ENRICH_ATTEMPTS
						? ("enriched" as const)
						: ("partial" as const),
				attempts: 1,
				matched,
				failures,
				lastRunAt: sql`now()`,
				nextRetryAt,
			})
			.onConflictDoUpdate({
				target: enrichmentState.bookId,
				set: {
					status: sql`CASE WHEN ${enrichmentState.attempts} + 1 >= ${MAX_PARTIAL_ENRICH_ATTEMPTS} THEN 'enriched' ELSE 'partial' END`,
					attempts: sql`${enrichmentState.attempts} + 1`,
					matched,
					failures,
					lastRunAt: sql`now()`,
					nextRetryAt,
				},
			});
	}

	// The chain had nothing left to contribute (every provider-servable field is
	// already filled): mark the book done WITHOUT overwriting the matched/failure
	// history of the run that actually filled it.
	async markCompleted(bookId: number) {
		await db
			.insert(enrichmentState)
			.values({ bookId, status: "enriched", lastRunAt: sql`now()` })
			.onConflictDoUpdate({
				target: enrichmentState.bookId,
				set: { status: "enriched", lastRunAt: sql`now()` },
			});
	}

	// A run that produced nothing (all-transient failure): keep the current
	// status — the book is no more or less enriched than before — but record
	// what failed so the match manager can name the provider.
	async recordFailures(
		bookId: number,
		failures: EnrichmentFailure[],
		nextRetryAt?: Date | null,
	) {
		const nextRetry = nextRetryAt?.toISOString() ?? null;
		await db
			.insert(enrichmentState)
			.values({
				bookId,
				status: "pending",
				failures,
				lastRunAt: sql`now()`,
				nextRetryAt: nextRetry,
			})
			.onConflictDoUpdate({
				target: enrichmentState.bookId,
				set: { failures, lastRunAt: sql`now()`, nextRetryAt: nextRetry },
			});
	}

	async get(bookId: number) {
		const [row] = await db
			.select()
			.from(enrichmentState)
			.where(eq(enrichmentState.bookId, bookId))
			.limit(1);
		return row ?? null;
	}

	// Terminal = the automatic pipeline is done with this book (either it
	// matched or it exhausted its options). Non-terminal rows (or no row at
	// all) are picked up again by scans/reprocess.
	async isTerminal(bookId: number): Promise<boolean> {
		const [row] = await db
			.select({ status: enrichmentState.status })
			.from(enrichmentState)
			.where(eq(enrichmentState.bookId, bookId))
			.limit(1);
		return row != null && TERMINAL_STATUSES.includes(row.status);
	}

	// Human approval of a weak (title-only) match: review → enriched.
	async approve(bookIds: number[]) {
		if (bookIds.length === 0) return;
		await db
			.update(enrichmentState)
			.set({ status: "enriched" })
			.where(
				and(
					inArray(enrichmentState.bookId, bookIds),
					eq(enrichmentState.status, "review"),
				),
			);
	}

	// Enrichment summary for a finished library task's notification: what needs
	// human attention right now in that library.
	async attentionCountsForLibrary(libraryId: number) {
		const { rows } = await db.execute(sql`
			SELECT
				count(*) FILTER (WHERE es.status = 'no_match')::int AS "noMatch",
				count(*) FILTER (WHERE es.status = 'review')::int AS "review",
				count(*) FILTER (WHERE jsonb_array_length(es.failures) > 0)::int AS "failed"
			FROM enrichment_state es
			JOIN book b ON b.id = es.book_id
			WHERE b.library_id = ${libraryId} AND b.duplicate_of_book_id IS NULL
		`);
		const row = rows[0] as
			| { noMatch: number; review: number; failed: number }
			| undefined;
		return row ?? { noMatch: 0, review: 0, failed: 0 };
	}

	// Force re-enrich / manual retry: reopen the book for the pipeline.
	async resetForRetry(bookIds: number[]) {
		if (bookIds.length === 0) return;
		await db
			.update(enrichmentState)
			.set({ status: "pending", attempts: 0, nextRetryAt: null })
			.where(inArray(enrichmentState.bookId, bookIds));
	}

	// ---------- Match-manager queries (always server-scoped) ----------

	async countsByStatus(serverId: string, libraryUuid?: string) {
		const { rows } = await db.execute(sql`
			SELECT es.status, count(*)::int AS count
			FROM enrichment_state es
			JOIN book b ON b.id = es.book_id
			JOIN library l ON l.id = b.library_id
			WHERE l.server_id = ${serverId}
				AND b.duplicate_of_book_id IS NULL
				${libraryUuid ? sql`AND l.uuid = ${libraryUuid}` : sql``}
			GROUP BY es.status
		`);
		const counts: Record<EnrichmentStatus, number> = {
			pending: 0,
			enriched: 0,
			partial: 0,
			no_match: 0,
			review: 0,
		};
		for (const row of rows as { status: EnrichmentStatus; count: number }[]) {
			counts[row.status] = row.count;
		}
		return counts;
	}

	async list(
		serverId: string,
		filters: {
			status?: EnrichmentStatus;
			withFailures?: boolean;
			libraryUuid?: string;
			query?: string;
			limit: number;
			offset: number;
		},
	) {
		const { rows } = await db.execute(sql`
			SELECT
				b.uuid AS "bookUuid",
				COALESCE(bm.title, am.title, b.filename) AS "title",
				COALESCE(bm.cover, am.cover) AS "cover",
				l.media_type AS "mediaType",
				l.uuid AS "libraryUuid",
				l.name AS "libraryName",
				es.status,
				es.matched,
				es.failures,
				es.attempts,
				es.last_run_at AS "lastRunAt",
				es.next_retry_at AS "nextRetryAt",
				count(*) OVER ()::int AS "totalCount"
			FROM enrichment_state es
			JOIN book b ON b.id = es.book_id
			JOIN library l ON l.id = b.library_id
			LEFT JOIN book_metadata bm ON bm.book_id = b.id
			LEFT JOIN audiobook_metadata am ON am.book_id = b.id
			WHERE l.server_id = ${serverId}
				AND b.duplicate_of_book_id IS NULL
				${filters.status ? sql`AND es.status = ${filters.status}` : sql``}
				${filters.withFailures ? sql`AND jsonb_array_length(es.failures) > 0` : sql``}
				${filters.libraryUuid ? sql`AND l.uuid = ${filters.libraryUuid}` : sql``}
				${filters.query ? sql`AND COALESCE(bm.title, am.title, b.filename) ILIKE ${`%${filters.query}%`}` : sql``}
			ORDER BY es.last_run_at DESC NULLS LAST, b.id DESC
			LIMIT ${filters.limit} OFFSET ${filters.offset}
		`);
		const items = rows as {
			bookUuid: string;
			title: string | null;
			cover: string | null;
			mediaType: "ebook" | "audiobook";
			libraryUuid: string;
			libraryName: string | null;
			status: EnrichmentStatus;
			matched: EnrichmentMatch[];
			failures: EnrichmentFailure[];
			attempts: number;
			lastRunAt: string | null;
			nextRetryAt: string | null;
			totalCount: number;
		}[];
		const total = items[0]?.totalCount ?? 0;
		return {
			items: items.map(({ totalCount: _totalCount, ...item }) => item),
			total,
		};
	}

	// Resolve retryable books for a bulk retry, scoped to the server. Explicit
	// uuids win over the filter; both exclude hidden duplicate copies.
	async resolveRetryTargets(
		serverId: string,
		input: {
			bookUuids?: string[];
			filter?: { status?: EnrichmentStatus; libraryUuid?: string };
		},
	): Promise<
		{ bookId: number; uuid: string; mediaType: "ebook" | "audiobook" }[]
	> {
		if (input.bookUuids?.length) {
			const rows = await db
				.select({
					bookId: book.id,
					uuid: book.uuid,
					mediaType: library.mediaType,
				})
				.from(book)
				.innerJoin(library, eq(library.id, book.libraryId))
				.where(
					and(
						eq(library.serverId, serverId),
						isNull(book.duplicateOfBookId),
						inArray(book.uuid, input.bookUuids),
					),
				);
			return rows as Awaited<
				ReturnType<EnrichmentStateRepository["resolveRetryTargets"]>
			>;
		}
		const status = input.filter?.status;
		const { rows } = await db.execute(sql`
			SELECT b.id AS "bookId", b.uuid, l.media_type AS "mediaType"
			FROM enrichment_state es
			JOIN book b ON b.id = es.book_id
			JOIN library l ON l.id = b.library_id
			WHERE l.server_id = ${serverId}
				AND b.duplicate_of_book_id IS NULL
				${status ? sql`AND es.status = ${status}` : sql`AND es.status IN ('partial', 'no_match', 'pending')`}
				${input.filter?.libraryUuid ? sql`AND l.uuid = ${input.filter.libraryUuid}` : sql``}
			LIMIT 10000
		`);
		return rows as Awaited<
			ReturnType<EnrichmentStateRepository["resolveRetryTargets"]>
		>;
	}

	// Detail: state + per-field provenance for the origin inspector.
	async detail(serverId: string, bookUuid: string) {
		const { rows } = await db.execute(sql`
			SELECT
				b.id AS "bookId",
				b.uuid AS "bookUuid",
				COALESCE(bm.title, am.title, b.filename) AS "title",
				l.media_type AS "mediaType",
				es.status,
				es.matched,
				es.failures,
				es.attempts,
				es.last_run_at AS "lastRunAt",
				es.next_retry_at AS "nextRetryAt",
				COALESCE(bm.field_sources, am.field_sources, '{}'::jsonb) AS "fieldSources",
				COALESCE(bm.locked_fields, am.locked_fields, '{}'::text[]) AS "lockedFields"
			FROM book b
			JOIN library l ON l.id = b.library_id
			LEFT JOIN enrichment_state es ON es.book_id = b.id
			LEFT JOIN book_metadata bm ON bm.book_id = b.id
			LEFT JOIN audiobook_metadata am ON am.book_id = b.id
			WHERE l.server_id = ${serverId} AND b.uuid = ${bookUuid}
			LIMIT 1
		`);
		return (rows[0] ?? null) as {
			bookId: number;
			bookUuid: string;
			title: string | null;
			mediaType: "ebook" | "audiobook";
			status: EnrichmentStatus | null;
			matched: EnrichmentMatch[] | null;
			failures: EnrichmentFailure[] | null;
			attempts: number | null;
			lastRunAt: string | null;
			nextRetryAt: string | null;
			fieldSources: Record<string, { p: string; at: string }>;
			lockedFields: string[];
		} | null;
	}
}

export const enrichmentStateRepository = new EnrichmentStateRepository();
