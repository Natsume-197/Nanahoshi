import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SessionUpload } from "../reading-sessions.model";

const enabled = process.env.READING_SESSIONS_INTEGRATION === "1";

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected test data to exist");
	return value;
}

const noGoals = {
	readingUnit: "characters",
	reading: null,
	listeningMinutes: null,
};

describe.skipIf(!enabled)("reading sessions persistence", () => {
	let db: typeof import("@nanahoshi/db").db;
	let sql: typeof import("drizzle-orm").sql;
	let repo: typeof import("../reading-sessions.repository").readingSessionsRepository;
	const userId = `reading-test-${crypto.randomUUID()}`;
	const orgId = `reading-test-${crypto.randomUUID()}`;
	let bookId: number;
	const segment = {
		id: crypto.randomUUID(),
		startedAt: "2026-01-01T12:00:00.000Z",
		endedAt: "2026-01-01T12:10:00.000Z",
		seconds: 600,
		startPosition: 0.1,
		endPosition: 0.2,
		kind: "reading" as const,
	};
	const input: SessionUpload = {
		id: crypto.randomUUID(),
		bookUuid: crypto.randomUUID(),
		runId: null,
		startedAt: "2026-01-01T12:00:00.000Z",
		endedAt: null,
		state: "active",
		revision: 1,
		mode: "automatic",
		source: "web",
		device: "Test",
		installationId: crypto.randomUUID(),
		contentVersion: "test",
		timeZone: "UTC",
		segments: [segment],
	};
	beforeAll(async () => {
		({ db } = await import("@nanahoshi/db"));
		({ sql } = await import("drizzle-orm"));
		({ readingSessionsRepository: repo } = await import(
			"../reading-sessions.repository"
		));
		const { runMigrations, withStartupLock } = await import(
			"@nanahoshi/db/migrate"
		);
		await withStartupLock(runMigrations);
		await db.execute(
			sql`INSERT INTO "user" (id,name,email,email_verified,username,created_at,updated_at) VALUES (${userId},'Reading test',${`${userId}@example.test`},true,${userId},now(),now())`,
		);
		await db.execute(
			sql`INSERT INTO organization (id,name,slug,created_at) VALUES (${orgId},'Reading test',${orgId},now())`,
		);
		const lib = await db.execute(
			sql`INSERT INTO library (name,server_id,media_type,created_at) VALUES ('Reading test',${orgId},'ebook',now()) RETURNING id`,
		);
		const libId = Number((lib.rows[0] as { id: number }).id);
		const books = await db.execute(
			sql`INSERT INTO book (filename,filehash,uuid,library_id,media_type,created_at) VALUES ('reading-test.epub',${userId},${input.bookUuid},${libId},'ebook',now()) RETURNING id`,
		);
		bookId = Number((books.rows[0] as { id: number }).id);
	});
	afterAll(async () => {
		if (db) {
			await db.execute(sql`DELETE FROM organization WHERE id=${orgId}`);
			await db.execute(sql`DELETE FROM "user" WHERE id=${userId}`);
		}
	});
	test("concurrent retries store a segment only once", async () => {
		const results = await Promise.all([
			repo.sync(userId, bookId, input),
			repo.sync(userId, bookId, input),
		]);
		expect(results[0]?.runId).toBe(results[1]?.runId);
		const history = await repo.history(userId, bookId);
		expect(history.runs).toHaveLength(1);
		expect(history.rows).toHaveLength(1);
		expect(history.rows[0]?.segment?.seconds).toBe(600);
	});
	test("higher revisions preserve old segments and stale revisions cannot reopen", async () => {
		await repo.sync(userId, bookId, {
			...input,
			revision: 2,
			state: "finished",
			endedAt: "2026-01-01T12:20:00.000Z",
			segments: [
				{
					...segment,
					id: crypto.randomUUID(),
					startedAt: "2026-01-01T12:10:00.000Z",
					endedAt: "2026-01-01T12:20:00.000Z",
				},
			],
		});
		await repo.sync(userId, bookId, input);
		const h = await repo.history(userId, bookId);
		expect(h.rows).toHaveLength(2);
		expect(h.rows[0]?.session.state).toBe("finished");
	});
	test("another account cannot attach to, edit, or discard the session", async () => {
		await expect(repo.sync("someone-else", bookId, input)).rejects.toThrow(
			"Session not found",
		);
		await expect(
			repo.editSession("someone-else", bookId, input.id),
		).rejects.toThrow("Session not found");
	});
	test("finishing and reopening a book does not manufacture a reread", async () => {
		const h = await repo.history(userId, bookId);
		const run = required(h.runs[0]);
		await repo.mutateRun(userId, bookId, run.id, "finish");
		const next = await repo.sync(userId, bookId, {
			...input,
			id: crypto.randomUUID(),
			segments: [],
		});
		expect(next.runId).toBe(run.id);
	});
	test("explicit reread is idempotent and preserves previous sessions", async () => {
		const id = crypto.randomUUID();
		await repo.mutateRun(userId, bookId, id, "reread");
		await repo.mutateRun(userId, bookId, id, "reread");
		const h = await repo.history(userId, bookId);
		expect(h.runs).toHaveLength(2);
		expect(h.rows.length).toBeGreaterThanOrEqual(2);
	});
	test("a reading goal is set, returned with the run and cleared", async () => {
		const run = required((await repo.history(userId, bookId)).runs[0]);
		await repo.setGoal(userId, bookId, run.id, "2026-10-05");
		expect(
			(await repo.history(userId, bookId)).runs.find((r) => r.id === run.id)
				?.goalDate,
		).toBe("2026-10-05");
		await repo.setGoal(userId, bookId, run.id, null);
		expect(
			(await repo.history(userId, bookId)).runs.find((r) => r.id === run.id)
				?.goalDate,
		).toBeNull();
		await expect(
			repo.setGoal("someone-else", bookId, run.id, "2026-10-05"),
		).rejects.toThrow("Reading not found");
	});
	test("a reading can be discarded with all of its sessions", async () => {
		const before = await repo.history(userId, bookId);
		const run = required(before.runs[0]);
		await repo.discardRun(userId, bookId, run.id);
		const after = await repo.history(userId, bookId);
		expect(after.runs.some((row) => row.id === run.id)).toBe(false);
		expect(after.rows.some((row) => row.session.runId === run.id)).toBe(false);
		await expect(
			repo.discardRun("someone-else", bookId, run.id),
		).rejects.toThrow("Reading not found");
	});
	test("discard is durable against queued retries", async () => {
		await repo.editSession(userId, bookId, input.id);
		await repo.sync(userId, bookId, { ...input, revision: 100 });
		const h = await repo.history(userId, bookId);
		expect(h.rows.some((r) => r.session.id === input.id)).toBe(false);
	});
	test("preferences are scoped to the account", async () => {
		expect(await repo.preferences(userId)).toEqual({
			mode: "automatic",
			idleMinutes: 5,
			dayStartHour: 0,
			goals: noGoals,
		});
		await repo.setPreferences(userId, { mode: "manual", idleMinutes: 10 });
		expect(await repo.preferences(userId)).toEqual({
			mode: "manual",
			idleMinutes: 10,
			dayStartHour: 0,
			goals: noGoals,
		});
	});
	test("new envelopes must contain previously persisted segments", async () => {
		const session = {
			...input,
			id: crypto.randomUUID(),
			segments: [{ ...segment, id: crypto.randomUUID() }],
		};
		await repo.sync(userId, bookId, session);
		await expect(
			repo.sync(userId, bookId, {
				...session,
				revision: 2,
				state: "finished",
				endedAt: "2026-01-01T12:05:00Z",
				segments: [],
			}),
		).rejects.toThrow("Invalid session segment");
		const h = await repo.history(userId, bookId);
		expect(
			h.rows.find((r) => r.session.id === session.id)?.session.revision,
		).toBe(1);
	});
	test("segment IDs cannot be reused with a different payload or session", async () => {
		const session = {
			...input,
			id: crypto.randomUUID(),
			segments: [{ ...segment, id: crypto.randomUUID() }],
		};
		await repo.sync(userId, bookId, session);
		for (const revision of [1, 2]) {
			await expect(
				repo.sync(userId, bookId, {
					...session,
					revision,
					segments: [{ ...required(session.segments[0]), seconds: 300 }],
				}),
			).rejects.toThrow("Segment ID conflict");
		}
		await expect(
			repo.sync(userId, bookId, {
				...session,
				id: crypto.randomUUID(),
			}),
		).rejects.toThrow("Segment ID conflict");
	});
	test("offline uploads choose the run at activity time, not upload time", async () => {
		const h = await repo.history(userId, bookId);
		const original = required(h.runs.at(-1));
		const result = await repo.sync(userId, bookId, {
			...input,
			id: crypto.randomUUID(),
			segments: [],
		});
		expect(result.runId).toBe(original.id);
	});
	test("activity predating every run gets a closed historical run", async () => {
		const result = await repo.sync(userId, bookId, {
			...input,
			id: crypto.randomUUID(),
			startedAt: "2025-12-01T00:00:00Z",
			segments: [],
		});
		const h = await repo.history(userId, bookId);
		const run = required(h.runs.find((r) => r.id === result.runId));
		expect(run.state).toBe("left");
		expect(run.closureReason).toBe("historical_import");
		expect(h.runs[0]?.id).not.toBe(run.id);
	});
	test("run closure distinguishes explicit leave, finish, and reread", async () => {
		const first = crypto.randomUUID();
		await repo.mutateRun(userId, bookId, first, "reread");
		await repo.mutateRun(userId, bookId, crypto.randomUUID(), "reread");
		let h = await repo.history(userId, bookId);
		expect(h.runs.find((r) => r.id === first)?.closureReason).toBe("reread");
		const current = required(h.runs[0]);
		expect(
			(await repo.mutateRun(userId, bookId, current.id, "leave"))
				?.closureReason,
		).toBe("leave");
		expect(
			(await repo.mutateRun(userId, bookId, current.id, "finish"))
				?.closureReason,
		).toBe("finish");
		h = await repo.history(userId, bookId);
		expect(h.runs.find((r) => r.id === current.id)?.closureReason).toBe(
			"finish",
		);
	});
	test("history scopes segments to the selected run and overlapping dates", async () => {
		const h = await repo.history(userId, bookId);
		const row = required(h.rows.find((r) => r.segment));
		const selected = await repo.history(userId, bookId, {
			runId: row.session.runId,
			from: "2026-01-01T12:05:00Z",
			to: "2026-01-01T12:06:00Z",
		});
		expect(selected.runs).toHaveLength(h.runs.length);
		expect(selected.rows.length).toBeGreaterThan(0);
		expect(
			selected.rows.every((r) => r.session.runId === row.session.runId),
		).toBe(true);
		const outside = await repo.history(userId, bookId, {
			runId: row.session.runId,
			from: "2026-01-01T12:10:00Z",
		});
		expect(outside.rows).toHaveLength(0);
		const current = await repo.history(userId, bookId, {});
		expect(current.rows.every((r) => r.session.runId === h.runs[0]?.id)).toBe(
			true,
		);
	});
	test("same-revision envelopes and stale unacknowledged segments are rejected", async () => {
		const session = {
			...input,
			id: crypto.randomUUID(),
			segments: [{ ...segment, id: crypto.randomUUID() }],
		};
		await repo.sync(userId, bookId, session);
		await expect(
			repo.sync(userId, bookId, {
				...session,
				endedAt: "2026-01-01T12:05:00Z",
				segments: [],
			}),
		).rejects.toThrow("Invalid session segment");
		await expect(
			repo.sync(userId, bookId, {
				...session,
				segments: [
					{ ...required(session.segments[0]), id: crypto.randomUUID() },
				],
			}),
		).rejects.toThrow("Stale revision contains unacknowledged segments");
	});
	test("duplicate IDs within a batch must have identical payloads", async () => {
		const part = { ...segment, id: crypto.randomUUID() };
		const session = {
			...input,
			id: crypto.randomUUID(),
			segments: [part, { ...part, endLocator: "changed" }],
		};
		await expect(repo.sync(userId, bookId, session)).rejects.toThrow(
			"Segment ID conflict",
		);
		await repo.sync(userId, bookId, { ...session, segments: [part, part] });
		const h = await repo.history(userId, bookId);
		expect(h.rows.filter((r) => r.session.id === session.id)).toHaveLength(1);
	});
	test("concurrent cross-owner segment collisions roll back the losing session", async () => {
		const otherUser = `reading-test-${crypto.randomUUID()}`;
		await db.execute(
			sql`INSERT INTO "user" (id,name,email,email_verified,username,created_at,updated_at) VALUES (${otherUser},'Reading test',${`${otherUser}@example.test`},true,${otherUser},now(),now())`,
		);
		try {
			const part = { ...segment, id: crypto.randomUUID() };
			const results = await Promise.allSettled(
				[userId, otherUser].map((owner) =>
					repo.sync(owner, bookId, {
						...input,
						id: crypto.randomUUID(),
						segments: [part],
					}),
				),
			);
			expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
			const failure = results.find((r) => r.status === "rejected");
			expect(failure?.reason.message).toBe("Segment ID conflict");
			const rows = await db.execute(
				sql`SELECT count(*)::int AS count FROM reading_segment WHERE id=${part.id}`,
			);
			expect(rows.rows[0]?.count).toBe(1);
		} finally {
			await db.execute(sql`DELETE FROM "user" WHERE id=${otherUser}`);
		}
	});
	test("a listening session keeps the audiobook length it was played at", async () => {
		const session: SessionUpload = {
			...input,
			id: crypto.randomUUID(),
			startedAt: "2026-02-01T12:00:00.000Z",
			contentVersion: "audio:1:36000",
			durationSeconds: 36_000,
			segments: [
				{
					...segment,
					id: crypto.randomUUID(),
					startedAt: "2026-02-01T12:00:00.000Z",
					endedAt: "2026-02-01T12:10:00.000Z",
					kind: "listening",
				},
			],
		};
		await repo.sync(userId, bookId, session);
		await repo.sync(userId, bookId, {
			...session,
			revision: 2,
			durationSeconds: 36_100,
			segments: [],
		});
		const h = await repo.history(userId, bookId);
		const row = h.rows.find((r) => r.session.id === session.id);
		expect(row?.session.durationSeconds).toBe(36_100);
		expect(row?.segment?.kind).toBe("listening");
	});
	test("a session keeps the reader's chapter map and later revisions refresh it", async () => {
		const chapters = [
			{ title: "序章", start: 0 },
			{ title: "第一章", start: 0.12 },
		];
		const session: SessionUpload = {
			...input,
			id: crypto.randomUUID(),
			startedAt: "2026-03-01T12:00:00.000Z",
			chapters,
			segments: [
				{
					...segment,
					id: crypto.randomUUID(),
					startedAt: "2026-03-01T12:00:00.000Z",
					endedAt: "2026-03-01T12:10:00.000Z",
				},
			],
		};
		await repo.sync(userId, bookId, session);
		const read = async () =>
			(await repo.history(userId, bookId)).rows.find(
				(r) => r.session.id === session.id,
			)?.session.chapters;
		expect(await read()).toEqual(chapters);
		// Omitting the map on a later revision keeps the stored one.
		await repo.sync(userId, bookId, {
			...session,
			revision: 2,
			chapters: null,
			segments: [],
		});
		expect(await read()).toEqual(chapters);
	});
	test("the day start hour is stored and survives changing other preferences", async () => {
		await repo.setPreferences(userId, {
			mode: "automatic",
			idleMinutes: 5,
			dayStartHour: 4,
		});
		await repo.setPreferences(userId, { mode: "manual", idleMinutes: 10 });
		expect(await repo.preferences(userId)).toEqual({
			mode: "manual",
			idleMinutes: 10,
			dayStartHour: 4,
			goals: noGoals,
		});
	});
	test("daily goals are stored, cleared and kept apart from other preferences", async () => {
		const goals = {
			readingUnit: "minutes" as const,
			reading: 30,
			listeningMinutes: 45,
		};
		expect((await repo.setGoals(userId, goals)).goals).toEqual(goals);
		await repo.setPreferences(userId, { mode: "manual", idleMinutes: 7 });
		expect((await repo.preferences(userId)).goals).toEqual(goals);
		await repo.setGoals(userId, noGoals);
		expect((await repo.preferences(userId)).goals).toEqual(noGoals);
	});
});
