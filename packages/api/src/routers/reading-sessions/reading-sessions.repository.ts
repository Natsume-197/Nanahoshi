import { db } from "@nanahoshi-v2/db";
import {
	readingRun,
	readingSegment,
	readingSession,
	readingTrackingPreference,
} from "@nanahoshi-v2/db/schema/reading-sessions";
import {
	and,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	lt,
	lte,
	or,
	sql,
} from "drizzle-orm";
import { ConflictError, NotFoundError } from "../../errors";
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
		};
	}
	async setPreferences(
		userId: string,
		value: { mode: string; idleMinutes: number },
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
}
export const readingSessionsRepository = new ReadingSessionsRepository();
