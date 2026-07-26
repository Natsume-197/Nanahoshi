import { db } from "@nanahoshi-v2/db";
import {
	book,
	type EnrichmentFailure,
	type EnrichmentMatch,
	type EnrichmentStatus,
	enrichmentState,
	library,
} from "@nanahoshi-v2/db/schema/general";
import {
	and,
	eq,
	inArray,
	isNotNull,
	isNull,
	type SQL,
	sql,
} from "drizzle-orm";
import {
	bucketCaseSql,
	type EnrichmentBucket,
	type EnrichmentLifecycle,
	lifecycleCaseSql,
} from "../../modules/metadataEnrichment/enrichment-lifecycle";
import {
	type AdmissionFacts,
	TERMINAL_STATUSES,
} from "../../modules/metadataEnrichment/metadata-enrichment.admission";
import {
	consumesProviderAttempt,
	MAX_PROVIDER_RETRY_ATTEMPTS,
} from "../../modules/metadataRetry/metadata-retry.policy";

// Partial matches (a provider matched but critical data like authors is
// missing — usually a transient hiccup) stay retryable across later scans,
// finalizing only once this cap is reached so genuinely incomplete titles
// stop hammering the external APIs.
export const MAX_PARTIAL_ENRICH_ATTEMPTS = 3;
const RETRY_LEASE_MINUTES = 5;

// Shared filter shape for every match-manager query (list / counts / bulk).
export type TrayFilter = {
	bucket?: EnrichmentBucket;
	/** Narrows within a bucket, e.g. only "no_match" inside Attention. */
	lifecycle?: EnrichmentLifecycle;
	libraryUuid?: string;
	mediaType?: "ebook" | "audiobook";
	withFailures?: boolean;
	query?: string;
};
export type TraySort = "recent" | "oldest" | "title";

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
		const failures = run.failures ?? [];
		const retryable = run.nextRetryAt != null;
		const attemptDelta = retryable && consumesProviderAttempt(failures) ? 1 : 0;
		const requestedRetryAt = run.nextRetryAt?.toISOString() ?? null;
		const values = {
			bookId,
			status: run.status,
			matched: run.matched ?? [],
			failures,
			lastRunAt: sql`now()`,
			providerAttempts: attemptDelta,
			nextRetryAt:
				attemptDelta >= MAX_PROVIDER_RETRY_ATTEMPTS ? null : requestedRetryAt,
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
					providerAttempts: retryable
						? sql`${enrichmentState.providerAttempts} + ${attemptDelta}`
						: 0,
					nextRetryAt: retryable
						? sql`CASE WHEN ${enrichmentState.retryCancelledAt} IS NOT NULL OR ${enrichmentState.providerAttempts} + ${attemptDelta} >= ${MAX_PROVIDER_RETRY_ATTEMPTS} THEN NULL ELSE ${requestedRetryAt}::timestamptz END`
						: null,
					retryCancelledAt: retryable ? enrichmentState.retryCancelledAt : null,
				},
			});
	}

	// A match missing critical data (e.g. author-less audiobook match) counts
	// attempts and finalizes to "enriched" at the cap; below it the row stays
	// "partial" so later scans retry.
	async recordPartialMatch(bookId: number, run: Omit<EnrichmentRun, "status">) {
		const matched = run.matched ?? [];
		const failures = run.failures ?? [];
		const attemptDelta = consumesProviderAttempt(failures) ? 1 : 0;
		const requestedRetryAt = run.nextRetryAt?.toISOString() ?? null;
		const nextRetryAt =
			attemptDelta >= MAX_PROVIDER_RETRY_ATTEMPTS ? null : requestedRetryAt;
		await db
			.insert(enrichmentState)
			.values({
				bookId,
				status:
					1 >= MAX_PARTIAL_ENRICH_ATTEMPTS
						? ("enriched" as const)
						: ("partial" as const),
				attempts: 1,
				providerAttempts: attemptDelta,
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
					providerAttempts: sql`${enrichmentState.providerAttempts} + ${attemptDelta}`,
					matched,
					failures,
					lastRunAt: sql`now()`,
					nextRetryAt: sql`CASE
							WHEN ${enrichmentState.retryCancelledAt} IS NOT NULL THEN NULL
							WHEN ${enrichmentState.attempts} + 1 >= ${MAX_PARTIAL_ENRICH_ATTEMPTS} THEN NULL
							WHEN ${enrichmentState.providerAttempts} + ${attemptDelta} >= ${MAX_PROVIDER_RETRY_ATTEMPTS} THEN NULL
							ELSE ${requestedRetryAt}::timestamptz
						END`,
				},
			});
	}

	// The chain had nothing left to contribute (every provider-servable field is
	// already filled): mark the book done WITHOUT overwriting the matched/failure
	// history of the run that actually filled it.
	async markCompleted(bookId: number) {
		await db
			.insert(enrichmentState)
			.values({
				bookId,
				status: "enriched",
				lastRunAt: sql`now()`,
				providerAttempts: 0,
				nextRetryAt: null,
				retryCancelledAt: null,
			})
			.onConflictDoUpdate({
				target: enrichmentState.bookId,
				set: {
					status: "enriched",
					lastRunAt: sql`now()`,
					providerAttempts: 0,
					nextRetryAt: null,
					retryCancelledAt: null,
				},
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
		const attemptDelta = consumesProviderAttempt(failures) ? 1 : 0;
		const nextRetry = nextRetryAt?.toISOString() ?? null;
		await db
			.insert(enrichmentState)
			.values({
				bookId,
				status: "pending",
				failures,
				lastRunAt: sql`now()`,
				providerAttempts: attemptDelta,
				nextRetryAt:
					attemptDelta >= MAX_PROVIDER_RETRY_ATTEMPTS ? null : nextRetry,
			})
			.onConflictDoUpdate({
				target: enrichmentState.bookId,
				set: {
					failures,
					lastRunAt: sql`now()`,
					providerAttempts: sql`${enrichmentState.providerAttempts} + ${attemptDelta}`,
					nextRetryAt: sql`CASE
						WHEN ${enrichmentState.status} NOT IN ('pending', 'partial') THEN NULL
						WHEN ${enrichmentState.retryCancelledAt} IS NOT NULL THEN NULL
						WHEN ${enrichmentState.providerAttempts} + ${attemptDelta} >= ${MAX_PROVIDER_RETRY_ATTEMPTS} THEN NULL
						ELSE ${nextRetry}::timestamptz
					END`,
				},
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

	// Cheap enqueue-side check for the incidental paths (promote, ungroup).
	// Enrichment Admission still re-decides authoritatively in the worker.
	async isTerminal(bookId: number): Promise<boolean> {
		const [row] = await db
			.select({ status: enrichmentState.status })
			.from(enrichmentState)
			.where(eq(enrichmentState.bookId, bookId))
			.limit(1);
		return row != null && TERMINAL_STATUSES.includes(row.status);
	}

	/**
	 * Every fact Enrichment Admission needs, in one read. Anchored on `book`
	 * with a LEFT JOIN because a book awaiting its first enrichment has no
	 * enrichment_state row yet. Returns null when the book is gone.
	 */
	async admissionFacts(bookId: number): Promise<AdmissionFacts | null> {
		const [row] = await db
			.select({
				duplicateOfBookId: book.duplicateOfBookId,
				libraryPausedAt: library.autoEnrichPausedAt,
				status: enrichmentState.status,
				archivedAt: enrichmentState.archivedAt,
				nextRetryAt: enrichmentState.nextRetryAt,
				retryCancelledAt: enrichmentState.retryCancelledAt,
				retryGeneration: enrichmentState.retryGeneration,
			})
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(enrichmentState, eq(enrichmentState.bookId, book.id))
			.where(eq(book.id, bookId))
			.limit(1);
		if (!row) return null;
		return { ...row, retryGeneration: row.retryGeneration ?? 0 };
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
			.set({
				status: "pending",
				attempts: 0,
				providerAttempts: 0,
				nextRetryAt: null,
				retryCancelledAt: null,
				retryGeneration: sql`${enrichmentState.retryGeneration} + 1`,
			})
			.where(inArray(enrichmentState.bookId, bookIds));
	}

	/**
	 * Stops the current automatic retry cycle. Incrementing the generation fences
	 * jobs that were already leased into Redis; a manual retry opens a new cycle.
	 */
	async cancelRetries(bookIds: number[]): Promise<number> {
		if (bookIds.length === 0) return 0;
		const cancelled = await db
			.update(enrichmentState)
			.set({
				nextRetryAt: null,
				retryCancelledAt: sql`now()`,
				retryGeneration: sql`${enrichmentState.retryGeneration} + 1`,
			})
			.where(
				and(
					inArray(enrichmentState.bookId, bookIds),
					isNotNull(enrichmentState.nextRetryAt),
				),
			)
			.returning({ bookId: enrichmentState.bookId });
		return cancelled.length;
	}

	/**
	 * "Stop extraction": suspends automatic work for retryable books, whether or
	 * not a retry was scheduled yet. Marks the cancellation durably (also fencing
	 * any already-leased jobs via the generation) and clears the pending retry.
	 * A manual reprocess reopens the book. Saved metadata is never touched.
	 */
	async stop(bookIds: number[]): Promise<number> {
		if (bookIds.length === 0) return 0;
		const stopped = await db
			.update(enrichmentState)
			.set({
				nextRetryAt: null,
				retryCancelledAt: sql`now()`,
				retryGeneration: sql`${enrichmentState.retryGeneration} + 1`,
			})
			.where(
				and(
					inArray(enrichmentState.bookId, bookIds),
					isNull(enrichmentState.archivedAt),
					inArray(enrichmentState.status, ["pending", "partial"]),
					isNull(enrichmentState.retryCancelledAt),
				),
			)
			.returning({ bookId: enrichmentState.bookId });
		return stopped.length;
	}

	/** Retire books from the active tray. Never deletes the book or its metadata. */
	async archive(bookIds: number[]): Promise<number> {
		if (bookIds.length === 0) return 0;
		const archived = await db
			.update(enrichmentState)
			.set({
				archivedAt: sql`now()`,
				// Retiring a book also stops it, exactly like stop(): the pending
				// appointment is dropped and the generation fences jobs already
				// leased into BullMQ. Without this an archived book keeps being
				// dispatched, and restoring it would show a retry that is gone.
				nextRetryAt: null,
				retryCancelledAt: sql`coalesce(${enrichmentState.retryCancelledAt}, now())`,
				retryGeneration: sql`${enrichmentState.retryGeneration} + 1`,
			})
			.where(
				and(
					inArray(enrichmentState.bookId, bookIds),
					isNull(enrichmentState.archivedAt),
				),
			)
			.returning({ bookId: enrichmentState.bookId });
		return archived.length;
	}

	/** Restore archived books back into their natural bucket. */
	async unarchive(bookIds: number[]): Promise<number> {
		if (bookIds.length === 0) return 0;
		const restored = await db
			.update(enrichmentState)
			.set({ archivedAt: null })
			.where(
				and(
					inArray(enrichmentState.bookId, bookIds),
					isNotNull(enrichmentState.archivedAt),
				),
			)
			.returning({ bookId: enrichmentState.bookId });
		return restored.length;
	}

	/** Redis admission failed after a manual reset; keep the intent durable. */
	async deferRetryAdmission(bookIds: number[], retryAt: Date) {
		if (bookIds.length === 0) return;
		await db
			.update(enrichmentState)
			.set({ nextRetryAt: retryAt.toISOString() })
			.where(inArray(enrichmentState.bookId, bookIds));
	}

	/**
	 * Claims due durable retry intents for a short lease. If Redis admission
	 * fails, the lease expires and a later dispatcher picks them up again.
	 */
	async leaseDueRetries(limit = 250): Promise<
		{
			bookId: number;
			uuid: string;
			mediaType: "ebook" | "audiobook";
			providerAttempts: number;
			retryGeneration: number;
		}[]
	> {
		const { rows } = await db.execute(sql`
			WITH due AS (
				SELECT
					es.book_id,
					b.uuid,
					l.media_type,
					es.provider_attempts,
					es.retry_generation
				FROM enrichment_state es
				JOIN book b ON b.id = es.book_id
				JOIN library l ON l.id = b.library_id
				WHERE es.next_retry_at <= now()
					AND es.retry_cancelled_at IS NULL
					AND es.provider_attempts < ${MAX_PROVIDER_RETRY_ATTEMPTS}
					AND es.status IN ('pending', 'partial')
					AND b.duplicate_of_book_id IS NULL
					AND l.auto_enrich_paused_at IS NULL
				ORDER BY es.next_retry_at ASC
				FOR UPDATE OF es SKIP LOCKED
				LIMIT ${limit}
			)
			UPDATE enrichment_state es
			SET next_retry_at = now() + (${RETRY_LEASE_MINUTES} * interval '1 minute')
			FROM due
			WHERE es.book_id = due.book_id
			RETURNING
				es.book_id AS "bookId",
				due.uuid,
				due.media_type AS "mediaType",
				due.provider_attempts AS "providerAttempts",
				due.retry_generation AS "retryGeneration"
		`);
		return rows as Awaited<
			ReturnType<EnrichmentStateRepository["leaseDueRetries"]>
		>;
	}

	// ---------- Match-manager queries (always server-scoped) ----------

	// Counts per task-oriented bucket for the tray nav. The bucket derivation is
	// the SQL mirror of resolveBucket() — one source of truth in
	// enrichment-lifecycle.ts drives both this and the row chip.
	async countsByBucket(
		serverId: string,
		filter: Pick<TrayFilter, "libraryUuid" | "mediaType" | "withFailures"> = {},
	) {
		const { rows } = await db.execute(sql`
			SELECT ${bucketCaseSql()} AS bucket, count(*)::int AS count
			FROM enrichment_state es
			JOIN book b ON b.id = es.book_id
			JOIN library l ON l.id = b.library_id
			WHERE l.server_id = ${serverId}
				AND b.duplicate_of_book_id IS NULL
				${filter.libraryUuid ? sql`AND l.uuid = ${filter.libraryUuid}` : sql``}
				${filter.mediaType ? sql`AND l.media_type = ${filter.mediaType}` : sql``}
				${filter.withFailures ? sql`AND jsonb_array_length(es.failures) > 0` : sql``}
			GROUP BY 1
		`);
		const counts: Record<EnrichmentBucket, number> = {
			in_progress: 0,
			attention: 0,
			stopped: 0,
			completed: 0,
			history: 0,
		};
		for (const row of rows as { bucket: EnrichmentBucket; count: number }[]) {
			counts[row.bucket] = row.count;
		}
		return counts;
	}

	// Per-lifecycle counts inside one bucket, so the tray can offer "only the
	// books with no match" without the user guessing whether any exist.
	async countsByLifecycle(
		serverId: string,
		filter: Pick<
			TrayFilter,
			"bucket" | "libraryUuid" | "mediaType" | "withFailures"
		> = {},
	) {
		const { rows } = await db.execute(sql`
			SELECT ${lifecycleCaseSql()} AS lifecycle, count(*)::int AS count
			FROM enrichment_state es
			JOIN book b ON b.id = es.book_id
			JOIN library l ON l.id = b.library_id
			WHERE l.server_id = ${serverId}
				AND b.duplicate_of_book_id IS NULL
				${
					filter.bucket
						? sql`AND ${bucketCaseSql()} = ${filter.bucket}`
						: sql`AND es.archived_at IS NULL`
				}
				${filter.libraryUuid ? sql`AND l.uuid = ${filter.libraryUuid}` : sql``}
				${filter.mediaType ? sql`AND l.media_type = ${filter.mediaType}` : sql``}
				${filter.withFailures ? sql`AND jsonb_array_length(es.failures) > 0` : sql``}
			GROUP BY 1
		`);
		const counts: Partial<Record<EnrichmentLifecycle, number>> = {};
		for (const row of rows as {
			lifecycle: EnrichmentLifecycle;
			count: number;
		}[]) {
			counts[row.lifecycle] = row.count;
		}
		return counts;
	}

	// How many active (non-archived, still-unresolved) books each provider is
	// currently failing on — drives the systemic "provider X failed on N books"
	// banner instead of repeating the same message on every row.
	async providerFailureSummary(
		serverId: string,
		libraryUuid?: string,
	): Promise<Record<string, number>> {
		const { rows } = await db.execute(sql`
			SELECT f->>'provider' AS provider, count(DISTINCT es.book_id)::int AS count
			FROM enrichment_state es
			JOIN book b ON b.id = es.book_id
			JOIN library l ON l.id = b.library_id
			CROSS JOIN LATERAL jsonb_array_elements(es.failures) AS f
			WHERE l.server_id = ${serverId}
				AND b.duplicate_of_book_id IS NULL
				AND es.archived_at IS NULL
				AND es.status IN ('pending', 'partial')
				-- Only count a provider that failed AND didn't end up matching this
				-- book, so a provider that's actually working isn't flagged.
				AND NOT EXISTS (
					SELECT 1 FROM jsonb_array_elements(es.matched) mm
					WHERE mm->>'provider' = f->>'provider'
				)
				${libraryUuid ? sql`AND l.uuid = ${libraryUuid}` : sql``}
			GROUP BY 1
		`);
		const summary: Record<string, number> = {};
		for (const row of rows as { provider: string; count: number }[]) {
			if (row.provider) summary[row.provider] = row.count;
		}
		return summary;
	}

	// Distinct active books that carry any failure — the number a "disable +
	// reprocess" action will actually re-run once.
	async failingBookCount(
		serverId: string,
		libraryUuid?: string,
	): Promise<number> {
		const { rows } = await db.execute(sql`
			SELECT count(*)::int AS count
			FROM enrichment_state es
			JOIN book b ON b.id = es.book_id
			JOIN library l ON l.id = b.library_id
			WHERE l.server_id = ${serverId}
				AND b.duplicate_of_book_id IS NULL
				AND es.archived_at IS NULL
				AND es.status IN ('pending', 'partial')
				AND jsonb_array_length(es.failures) > 0
				${libraryUuid ? sql`AND l.uuid = ${libraryUuid}` : sql``}
		`);
		return (rows[0] as { count: number } | undefined)?.count ?? 0;
	}

	// Per-action eligibility over a filter, so "select all results" can tell the
	// user how many of the matched books each bulk action will actually affect.
	async actionableCounts(serverId: string, filter: TrayFilter) {
		const { rows } = await db.execute(sql`
			SELECT
				count(*) FILTER (
					WHERE es.archived_at IS NULL AND es.status <> 'enriched'
				)::int AS "retryable",
				count(*) FILTER (
					WHERE es.archived_at IS NULL
						AND es.retry_cancelled_at IS NULL
						AND es.status IN ('pending', 'partial')
				)::int AS "stoppable",
				count(*) FILTER (
					WHERE es.archived_at IS NULL AND es.status = 'review'
				)::int AS "approvable",
				count(*) FILTER (WHERE es.archived_at IS NULL)::int AS "archivable",
				count(*) FILTER (WHERE es.archived_at IS NOT NULL)::int AS "restorable"
			FROM enrichment_state es
			JOIN book b ON b.id = es.book_id
			JOIN library l ON l.id = b.library_id
			LEFT JOIN book_metadata bm ON bm.book_id = b.id
			LEFT JOIN audiobook_metadata am ON am.book_id = b.id
			WHERE ${this.#trayConditions(serverId, filter)}
		`);
		return (rows[0] ?? {
			retryable: 0,
			stoppable: 0,
			approvable: 0,
			archivable: 0,
			restorable: 0,
		}) as {
			retryable: number;
			stoppable: number;
			approvable: number;
			archivable: number;
			restorable: number;
		};
	}

	// Shared tray scoping: server + non-duplicate, plus optional bucket / library
	// / text filters. A bucket filter uses the shared CASE, so archived rows only
	// ever surface under the History bucket; with no bucket we exclude them so
	// the active tray never mixes in archived work. Requires the es/b/l joins and
	// (for the query filter) the bm/am joins to be present in the caller.
	#trayConditions(serverId: string, filter: TrayFilter): SQL {
		return sql`
			l.server_id = ${serverId}
			AND b.duplicate_of_book_id IS NULL
			${
				filter.bucket
					? sql`AND ${bucketCaseSql()} = ${filter.bucket}`
					: sql`AND es.archived_at IS NULL`
			}
			${filter.lifecycle ? sql`AND ${lifecycleCaseSql()} = ${filter.lifecycle}` : sql``}
			${filter.libraryUuid ? sql`AND l.uuid = ${filter.libraryUuid}` : sql``}
			${filter.mediaType ? sql`AND l.media_type = ${filter.mediaType}` : sql``}
			${filter.withFailures ? sql`AND jsonb_array_length(es.failures) > 0` : sql``}
			${filter.query ? sql`AND COALESCE(bm.title, am.title, b.filename) ILIKE ${`%${filter.query}%`}` : sql``}
		`;
	}

	async list(
		serverId: string,
		filters: TrayFilter & {
			sort?: TraySort;
			limit: number;
			offset: number;
		},
	) {
		const order =
			filters.sort === "oldest"
				? sql`es.last_run_at ASC NULLS FIRST, b.id ASC`
				: filters.sort === "title"
					? sql`COALESCE(bm.title, am.title, b.filename) ASC, b.id DESC`
					: sql`es.last_run_at DESC NULLS LAST, b.id DESC`;
		const { rows } = await db.execute(sql`
			SELECT
				b.uuid AS "bookUuid",
				COALESCE(bm.title, am.title, b.filename) AS "title",
				b.filename AS "filename",
				COALESCE(bm.cover, am.cover) AS "cover",
				l.media_type AS "mediaType",
				l.uuid AS "libraryUuid",
				l.name AS "libraryName",
				es.status,
				es.matched,
				es.failures,
				es.attempts,
				es.provider_attempts AS "providerAttempts",
				es.last_run_at AS "lastRunAt",
				es.next_retry_at AS "nextRetryAt",
				es.retry_cancelled_at AS "retryCancelledAt",
				es.archived_at AS "archivedAt",
				count(*) OVER ()::int AS "totalCount"
			FROM enrichment_state es
			JOIN book b ON b.id = es.book_id
			JOIN library l ON l.id = b.library_id
			LEFT JOIN book_metadata bm ON bm.book_id = b.id
			LEFT JOIN audiobook_metadata am ON am.book_id = b.id
			WHERE ${this.#trayConditions(serverId, filters)}
			ORDER BY ${order}
			LIMIT ${filters.limit} OFFSET ${filters.offset}
		`);
		const items = rows as {
			bookUuid: string;
			title: string | null;
			filename: string | null;
			cover: string | null;
			mediaType: "ebook" | "audiobook";
			libraryUuid: string;
			libraryName: string | null;
			status: EnrichmentStatus;
			matched: EnrichmentMatch[];
			failures: EnrichmentFailure[];
			attempts: number;
			providerAttempts: number;
			lastRunAt: string | null;
			nextRetryAt: string | null;
			retryCancelledAt: string | null;
			archivedAt: string | null;
			totalCount: number;
		}[];
		const total = items[0]?.totalCount ?? 0;
		return {
			items: items.map(({ totalCount: _totalCount, ...item }) => item),
			total,
		};
	}

	// Resolve books for a bulk action, scoped to the server. Explicit uuids win
	// over the filter; both exclude hidden duplicate copies. The filter path is
	// capped so a "select all results" over a huge library stays bounded.
	async resolveTargets(
		serverId: string,
		input: {
			bookUuids?: string[];
			filter?: TrayFilter;
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
				ReturnType<EnrichmentStateRepository["resolveTargets"]>
			>;
		}

		const { rows } = await db.execute(sql`
			SELECT b.id AS "bookId", b.uuid, l.media_type AS "mediaType"
			FROM enrichment_state es
			JOIN book b ON b.id = es.book_id
			JOIN library l ON l.id = b.library_id
			LEFT JOIN book_metadata bm ON bm.book_id = b.id
			LEFT JOIN audiobook_metadata am ON am.book_id = b.id
			WHERE ${this.#trayConditions(serverId, input.filter ?? {})}
			LIMIT 10000
		`);
		return rows as Awaited<
			ReturnType<EnrichmentStateRepository["resolveTargets"]>
		>;
	}

	// Detail: state + per-field provenance for the origin inspector.
	async detail(serverId: string, bookUuid: string) {
		const { rows } = await db.execute(sql`
			SELECT
				b.id AS "bookId",
				b.uuid AS "bookUuid",
				COALESCE(bm.title, am.title, b.filename) AS "title",
				b.filename AS "filename",
				l.media_type AS "mediaType",
				es.status,
				es.matched,
				es.failures,
				es.attempts,
				es.provider_attempts AS "providerAttempts",
				es.last_run_at AS "lastRunAt",
				es.next_retry_at AS "nextRetryAt",
				es.retry_cancelled_at AS "retryCancelledAt",
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
			filename: string | null;
			mediaType: "ebook" | "audiobook";
			status: EnrichmentStatus | null;
			matched: EnrichmentMatch[] | null;
			failures: EnrichmentFailure[] | null;
			attempts: number | null;
			providerAttempts: number | null;
			lastRunAt: string | null;
			nextRetryAt: string | null;
			retryCancelledAt: string | null;
			fieldSources: Record<string, { p: string; at: string }>;
			lockedFields: string[];
		} | null;
	}
}

export const enrichmentStateRepository = new EnrichmentStateRepository();
