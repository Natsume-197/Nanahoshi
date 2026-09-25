import { db } from "@nanahoshi/db";
import { book, library } from "@nanahoshi/db/schema/general";
import {
	readingRun,
	readingSegment,
	readingSession,
	readingTrackingPreference,
} from "@nanahoshi/db/schema/reading-sessions";
import {
	and,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	lt,
	lte,
	notInArray,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { ConflictError, NotFoundError } from "../../errors";
import {
	accessiblePredicateSql,
	type LibraryScope,
} from "../_shared/library-scope";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Which books are about to be removed; history survives all three removals. */
export type RemovalScope =
	| { bookId: number }
	| { libraryId: number }
	| { libraryPathId: number };

// Hands runs matching `candidates` to `target`. A user keeps one current reading per
// book, so an arriving "reading" run yields to the target's own or a newer arrival.
async function moveRuns(tx: Tx, candidates: SQL, target: number) {
	await tx.execute(sql`
		UPDATE reading_run r
		SET state = 'left', ended_at = COALESCE(r.ended_at, now()), closure_reason = 'leave'
		WHERE ${candidates} AND r.state = 'reading' AND (
			EXISTS (
				SELECT 1 FROM reading_run c
				WHERE c.book_id = ${target} AND c.user_id = r.user_id AND c.state = 'reading'
			)
			OR EXISTS (
				SELECT 1 FROM reading_run o
				WHERE o.id <> r.id AND o.user_id = r.user_id AND o.state = 'reading'
					AND o.started_at > r.started_at
					AND o.id IN (SELECT r.id FROM reading_run r WHERE ${candidates})
			)
		)`);
	const moved = await tx.execute(sql`
		UPDATE reading_run r
		SET book_id = ${target}, orphan_hash = NULL, orphan_server_id = NULL
		WHERE ${candidates}`);
	return moved.rowCount ?? 0;
}

import { type SessionUpload, validateSession } from "./reading-sessions.model";

export class ReadingSessionsRepository {
	async preferences(userId: string) {
		const [row] = await db
			.select()
			.from(readingTrackingPreference)
			.where(eq(readingTrackingPreference.userId, userId));
		return {
			mode: (row?.mode ?? "automatic") as "automatic" | "manual" | "off",
			idleMinutes: row?.idleMinutes ?? 5,
			dayStartHour: row?.dayStartHour ?? 0,
			goals: {
				readingUnit: row?.dailyReadingGoalUnit ?? "characters",
				reading: row?.dailyReadingGoal ?? null,
				listeningMinutes: row?.dailyListeningGoalMinutes ?? null,
			},
		};
	}
	async setGoals(
		userId: string,
		goals: {
			readingUnit: "characters" | "minutes";
			reading: number | null;
			listeningMinutes: number | null;
		},
	) {
		const value = {
			dailyReadingGoalUnit: goals.readingUnit,
			dailyReadingGoal: goals.reading,
			dailyListeningGoalMinutes: goals.listeningMinutes,
		};
		await db
			.insert(readingTrackingPreference)
			.values({ userId, ...value })
			.onConflictDoUpdate({
				target: readingTrackingPreference.userId,
				set: value,
			});
		return this.preferences(userId);
	}
	async setPreferences(
		userId: string,
		value: { mode: string; idleMinutes: number; dayStartHour?: number },
	) {
		await db
			.insert(readingTrackingPreference)
			.values({ userId, ...value })
			.onConflictDoUpdate({
				target: readingTrackingPreference.userId,
				set: value,
			});
		return this.preferences(userId);
	}
	async sync(userId: string, bookId: number, input: SessionUpload) {
		return db.transaction(async (tx) => {
			// Serializes retries, new runs and competing devices for one personal book.
			await tx.execute(
				sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${userId}:${bookId}`}, 0))`,
			);
			const [existing] = await tx
				.select({ session: readingSession, run: readingRun })
				.from(readingSession)
				.innerJoin(readingRun, eq(readingRun.id, readingSession.runId))
				.where(eq(readingSession.id, input.id));
			if (
				existing &&
				(existing.run.userId !== userId || existing.run.bookId !== bookId)
			)
				throw new NotFoundError("Session not found");
			if (existing?.session.discardedAt)
				return { runId: existing.session.runId };
			const persisted = await tx
				.select()
				.from(readingSegment)
				.where(
					or(
						eq(readingSegment.sessionId, input.id),
						input.segments.length
							? inArray(
									readingSegment.id,
									input.segments.map((s) => s.id),
								)
							: undefined,
					),
				);
			const payload = (
				s:
					| SessionUpload["segments"][number]
					| typeof readingSegment.$inferSelect,
			) =>
				JSON.stringify([
					Date.parse(s.startedAt),
					Date.parse(s.endedAt),
					s.seconds,
					s.startPosition,
					s.endPosition,
					s.startLocator ?? null,
					s.endLocator ?? null,
					s.kind,
				]);
			const known = new Map(persisted.map((s) => [s.id, s]));
			const incoming = new Map<string, string>();
			for (const s of input.segments) {
				const previous = known.get(s.id);
				if (
					(previous &&
						(previous.sessionId !== input.id ||
							payload(previous) !== payload(s))) ||
					(incoming.has(s.id) && incoming.get(s.id) !== payload(s))
				)
					throw new ConflictError("Segment ID conflict");
				incoming.set(s.id, payload(s));
			}
			if (existing && existing.session.revision >= input.revision) {
				if (input.segments.some((s) => !known.has(s.id)))
					throw new ConflictError(
						"Stale revision contains unacknowledged segments",
					);
				if (existing.session.revision === input.revision)
					validateSession({
						...input,
						segments: persisted.filter((s) => s.sessionId === input.id),
					});
				return { runId: existing.session.runId };
			}
			if (
				existing &&
				(existing.session.mode === "retrospective" ||
					existing.session.mode !== input.mode ||
					existing.session.contentVersion !== input.contentVersion ||
					Date.parse(existing.session.startedAt) !==
						Date.parse(input.startedAt) ||
					existing.session.installationId !== input.installationId)
			)
				throw new ConflictError(
					"Session has been corrected or belongs to another edition",
				);
			validateSession({
				...input,
				segments: [
					...persisted.filter((s) => s.sessionId === input.id),
					...input.segments,
				],
			});
			let runId = existing?.session.runId ?? input.runId;
			if (runId) {
				const [run] = await tx
					.select()
					.from(readingRun)
					.where(
						and(
							eq(readingRun.id, runId),
							eq(readingRun.userId, userId),
							eq(readingRun.bookId, bookId),
						),
					);
				if (!run) throw new NotFoundError("Reading not found");
			} else {
				const [current] = await tx
					.select()
					.from(readingRun)
					.where(
						and(
							eq(readingRun.userId, userId),
							eq(readingRun.bookId, bookId),
							lte(readingRun.startedAt, input.startedAt),
						),
					)
					.orderBy(desc(readingRun.startedAt))
					.limit(1);
				runId = current?.id ?? crypto.randomUUID();
				if (!current) {
					const [earliest] = await tx
						.select()
						.from(readingRun)
						.where(
							and(eq(readingRun.userId, userId), eq(readingRun.bookId, bookId)),
						)
						.orderBy(readingRun.startedAt)
						.limit(1);
					// A delayed first upload must not become activity in a later reread.
					await tx.insert(readingRun).values({
						id: runId,
						userId,
						bookId,
						startedAt: input.startedAt,
						...(earliest
							? {
									state: "left",
									endedAt: earliest.startedAt,
									closureReason: "historical_import" as const,
								}
							: {}),
					});
				}
			}
			const { bookUuid: _, segments, ...data } = input;
			if (!existing) await tx.insert(readingSession).values({ ...data, runId });
			else
				await tx
					.update(readingSession)
					.set({
						state: input.state,
						endedAt: input.endedAt,
						revision: input.revision,
						...(input.characterCount
							? { characterCount: input.characterCount }
							: {}),
						...(input.durationSeconds
							? { durationSeconds: input.durationSeconds }
							: {}),
						...(input.chapters?.length ? { chapters: input.chapters } : {}),
					})
					.where(eq(readingSession.id, input.id));
			if (segments.length) {
				await tx
					.insert(readingSegment)
					.values(segments.map((s) => ({ ...s, sessionId: input.id })))
					.onConflictDoNothing();
				// Also check conflicts committed by another book/account during this transaction.
				const stored = await tx
					.select()
					.from(readingSegment)
					.where(
						inArray(
							readingSegment.id,
							segments.map((s) => s.id),
						),
					);
				for (const s of stored) {
					if (s.sessionId !== input.id || payload(s) !== incoming.get(s.id))
						throw new ConflictError("Segment ID conflict");
				}
			}
			return { runId };
		});
	}
	async history(
		userId: string,
		bookId: number,
		filter?: { runId?: string; from?: string; to?: string },
	) {
		const runs = await db
			.select()
			.from(readingRun)
			.where(and(eq(readingRun.userId, userId), eq(readingRun.bookId, bookId)))
			.orderBy(desc(readingRun.startedAt));
		const selectedRunId = filter ? (filter.runId ?? runs[0]?.id) : undefined;
		const rows = await db
			.select({ session: readingSession, segment: readingSegment })
			.from(readingSession)
			.innerJoin(readingRun, eq(readingRun.id, readingSession.runId))
			.leftJoin(readingSegment, eq(readingSegment.sessionId, readingSession.id))
			.where(
				and(
					eq(readingRun.userId, userId),
					eq(readingRun.bookId, bookId),
					isNull(readingSession.discardedAt),
					selectedRunId ? eq(readingSession.runId, selectedRunId) : undefined,
					filter?.from ? gt(readingSegment.endedAt, filter.from) : undefined,
					filter?.to ? lt(readingSegment.startedAt, filter.to) : undefined,
				),
			)
			.orderBy(readingSegment.startedAt);
		return { runs, rows };
	}
	async mutateRun(
		userId: string,
		bookId: number,
		id: string,
		action: "reread" | "finish" | "leave",
	) {
		return db.transaction(async (tx) => {
			await tx.execute(
				sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${userId}:${bookId}`}, 0))`,
			);
			if (action === "reread") {
				const [existing] = await tx
					.select()
					.from(readingRun)
					.where(eq(readingRun.id, id));
				if (existing) {
					if (existing.userId !== userId || existing.bookId !== bookId)
						throw new NotFoundError("Reading not found");
					return existing;
				}
				const now = new Date().toISOString();
				await tx
					.update(readingRun)
					.set({ state: "left", endedAt: now, closureReason: "reread" })
					.where(
						and(
							eq(readingRun.userId, userId),
							eq(readingRun.bookId, bookId),
							eq(readingRun.state, "reading"),
						),
					);
				const [run] = await tx
					.insert(readingRun)
					.values({ id, userId, bookId, startedAt: now })
					.returning();
				return run;
			}
			const [run] = await tx
				.update(readingRun)
				.set({
					state: action === "finish" ? "finished" : "left",
					endedAt: new Date().toISOString(),
					closureReason: action,
				})
				.where(
					and(
						eq(readingRun.id, id),
						eq(readingRun.userId, userId),
						eq(readingRun.bookId, bookId),
					),
				)
				.returning();
			if (!run) throw new NotFoundError("Reading not found");
			return run;
		});
	}
	async setGoal(
		userId: string,
		bookId: number,
		id: string,
		goalDate: string | null,
	) {
		const [run] = await db
			.update(readingRun)
			.set({ goalDate })
			.where(
				and(
					eq(readingRun.id, id),
					eq(readingRun.userId, userId),
					eq(readingRun.bookId, bookId),
				),
			)
			.returning({ id: readingRun.id, goalDate: readingRun.goalDate });
		if (!run) throw new NotFoundError("Reading not found");
		return run;
	}
	async discardRun(userId: string, bookId: number, id: string) {
		const [run] = await db
			.delete(readingRun)
			.where(
				and(
					eq(readingRun.id, id),
					eq(readingRun.userId, userId),
					eq(readingRun.bookId, bookId),
				),
			)
			.returning({ id: readingRun.id });
		if (!run) throw new NotFoundError("Reading not found");
		return { ok: true };
	}
	async editSession(
		userId: string,
		bookId: number,
		id: string,
		segment?: SessionUpload["segments"][number],
	) {
		return db.transaction(async (tx) => {
			await tx.execute(
				sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${userId}:${bookId}`}, 0))`,
			);
			const [row] = await tx
				.select({ id: readingSession.id })
				.from(readingSession)
				.innerJoin(readingRun, eq(readingRun.id, readingSession.runId))
				.where(
					and(
						eq(readingSession.id, id),
						eq(readingRun.userId, userId),
						eq(readingRun.bookId, bookId),
					),
				);
			if (!row) throw new NotFoundError("Session not found");
			if (!segment) {
				await tx.delete(readingSegment).where(eq(readingSegment.sessionId, id));
				await tx
					.update(readingSession)
					.set({ discardedAt: new Date().toISOString() })
					.where(eq(readingSession.id, id));
			} else {
				await tx
					.update(readingSession)
					.set({
						mode: "retrospective",
						source: "manual",
						state: "finished",
						startedAt: segment.startedAt,
						endedAt: segment.endedAt,
					})
					.where(eq(readingSession.id, id));
				await tx.delete(readingSegment).where(eq(readingSegment.sessionId, id));
				await tx
					.insert(readingSegment)
					.values({ ...segment, kind: "manual", sessionId: id });
			}
			return { ok: true };
		});
	}
	/**
	 * Keeps the history of books about to be removed: moved to another copy of the
	 * same file on the server when one exists, otherwise parked by content hash
	 * until the file returns (a move or rename is a removal plus an addition).
	 */
	async preserveForRemoval(scope: RemovalScope) {
		const where =
			"bookId" in scope
				? eq(book.id, scope.bookId)
				: "libraryId" in scope
					? eq(book.libraryId, scope.libraryId)
					: eq(book.libraryPathId, scope.libraryPathId);
		return db.transaction(async (tx) => {
			const gone = await tx
				.select({
					id: book.id,
					hash: book.filehash,
					serverId: library.serverId,
				})
				.from(book)
				.innerJoin(library, eq(library.id, book.libraryId))
				.where(where);
			if (!gone.length) return { moved: 0, parked: 0 };
			const goneIds = gone.map((g) => g.id);
			let moved = 0;
			let parked = 0;
			for (const g of gone) {
				const [twin] = await tx
					.select({ id: book.id })
					.from(book)
					.innerJoin(library, eq(library.id, book.libraryId))
					.where(
						and(
							eq(book.filehash, g.hash),
							eq(library.serverId, g.serverId),
							notInArray(book.id, goneIds),
						),
					)
					.orderBy(book.id)
					.limit(1);
				if (twin)
					moved += await moveRuns(tx, sql`r.book_id = ${g.id}`, twin.id);
				else {
					const parkedRows = await tx
						.update(readingRun)
						.set({ orphanHash: g.hash, orphanServerId: g.serverId })
						.where(eq(readingRun.bookId, g.id));
					parked += parkedRows.rowCount ?? 0;
				}
			}
			return { moved, parked };
		});
	}
	/** Gives a newly added book the history its file had before it was removed. */
	async adoptOrphans(bookId: number) {
		return db.transaction(async (tx) => {
			const [target] = await tx
				.select({ hash: book.filehash, serverId: library.serverId })
				.from(book)
				.innerJoin(library, eq(library.id, book.libraryId))
				.where(eq(book.id, bookId));
			if (!target) return 0;
			return moveRuns(
				tx,
				sql`r.book_id IS NULL AND r.orphan_server_id = ${target.serverId} AND r.orphan_hash = ${target.hash}`,
				bookId,
			);
		});
	}
	/** A deleted server takes its members' reading history with it. */
	/** Every reading of the user on one server, including books since removed from it. */
	async overview(userId: string, serverId: string, scope: LibraryScope) {
		const onServer = sql`(l.server_id = ${serverId} OR (r.book_id IS NULL AND r.orphan_server_id = ${serverId}))`;
		const segments = await db.execute<{
			session_id: string;
			book_id: number | null;
			orphan_hash: string | null;
			character_count: number | null;
			duration_seconds: number | null;
			started_at: string;
			ended_at: string;
			seconds: number;
			start_position: number | null;
			end_position: number | null;
			kind: string;
		}>(sql`
			SELECT s.id AS session_id, r.book_id, r.orphan_hash, s.character_count, s.duration_seconds,
				g.started_at, g.ended_at, g.seconds, g.start_position, g.end_position, g.kind
			FROM reading_segment g
			JOIN reading_session s ON s.id = g.session_id
			JOIN reading_run r ON r.id = s.run_id
			LEFT JOIN book b ON b.id = r.book_id
			LEFT JOIN library l ON l.id = b.library_id
			WHERE r.user_id = ${userId} AND s.discarded_at IS NULL AND ${onServer}`);
		const runs = await db.execute<{
			book_id: number | null;
			orphan_hash: string | null;
			closure_reason: string | null;
			started_at: string;
			ended_at: string | null;
			media_type: string | null;
		}>(sql`
			SELECT r.book_id, r.orphan_hash, r.closure_reason, r.started_at, r.ended_at, l.media_type
			FROM reading_run r
			LEFT JOIN book b ON b.id = r.book_id
			LEFT JOIN library l ON l.id = b.library_id
			WHERE r.user_id = ${userId} AND ${onServer}`);
		// Books marked finished from the reader or a shelf never close a reading run.
		const completed = await db.execute<{
			book_id: number;
			medium: "reading" | "listening";
			started_at: string | null;
			completed_at: string;
		}>(sql`
			SELECT p.book_id, 'reading' AS medium, p.started_at, p.completed_at
			FROM reading_progress p
			JOIN book b ON b.id = p.book_id
			JOIN library l ON l.id = b.library_id
			WHERE p.user_id = ${userId} AND p.status = 'completed'
				AND p.completed_at IS NOT NULL AND l.server_id = ${serverId}
			UNION ALL
			SELECT p.book_id, 'listening', p.started_at, p.completed_at
			FROM listening_progress p
			JOIN book b ON b.id = p.book_id
			JOIN library l ON l.id = b.library_id
			WHERE p.user_id = ${userId} AND p.status = 'completed'
				AND p.completed_at IS NOT NULL AND l.server_id = ${serverId}`);
		const ids = [
			...new Set([
				...runs.rows.flatMap((r) => (r.book_id ? [Number(r.book_id)] : [])),
				...completed.rows.map((r) => Number(r.book_id)),
			]),
		];
		const visible = accessiblePredicateSql(scope) ?? sql`true`;
		const books = ids.length
			? await db.execute<{
					id: number;
					uuid: string;
					media_type: string;
					accessible: boolean;
					title: string | null;
					cover: string | null;
					main_color: string | null;
				}>(sql`
					SELECT b.id, b.uuid, l.media_type, (${visible}) AS accessible,
						COALESCE(bm.title, am.title) AS title,
						COALESCE(bm.cover, am.cover) AS cover,
						COALESCE(bm.main_color, am.main_color) AS main_color
					FROM book b
					JOIN library l ON l.id = b.library_id
					LEFT JOIN book_metadata bm ON bm.book_id = b.id
					LEFT JOIN audiobook_metadata am ON am.book_id = b.id
					WHERE b.id IN (${sql.join(
						ids.map((id) => sql`${id}`),
						sql`, `,
					)})`)
			: { rows: [] };
		return {
			segments: segments.rows,
			runs: runs.rows,
			completed: completed.rows,
			books: books.rows,
		};
	}
	async deleteForServer(tx: Tx, serverId: string) {
		await tx.execute(sql`
			DELETE FROM reading_run r USING book b, library l
			WHERE r.book_id = b.id AND b.library_id = l.id AND l.server_id = ${serverId}`);
	}
}
export const readingSessionsRepository = new ReadingSessionsRepository();
