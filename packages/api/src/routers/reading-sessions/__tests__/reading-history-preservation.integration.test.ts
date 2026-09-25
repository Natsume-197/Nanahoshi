import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const enabled = process.env.READING_SESSIONS_INTEGRATION === "1";

describe.skipIf(!enabled)("reading history survives book removal", () => {
	let db: typeof import("@nanahoshi/db").db;
	let sql: typeof import("drizzle-orm").sql;
	let repo: typeof import("../reading-sessions.repository").readingSessionsRepository;
	const tag = crypto.randomUUID();
	const userId = `preserve-${tag}`;
	const servers = [`preserve-a-${tag}`, `preserve-b-${tag}`];
	const libraries: Record<string, number> = {};

	async function addLibrary(name: string, serverId: string) {
		const rows = await db.execute(
			sql`INSERT INTO library (name,server_id,media_type,created_at) VALUES (${name},${serverId},'ebook',now()) RETURNING id`,
		);
		libraries[name] = Number((rows.rows[0] as { id: number }).id);
	}
	async function addBook(libraryName: string, hash: string) {
		const rows = await db.execute(
			sql`INSERT INTO book (filename,filehash,uuid,library_id,media_type,created_at) VALUES (${`${crypto.randomUUID()}.epub`},${hash},${crypto.randomUUID()},${libraries[libraryName]},'ebook',now()) RETURNING id`,
		);
		return Number((rows.rows[0] as { id: number }).id);
	}
	async function addRun(
		bookId: number,
		state = "reading",
		startedAt = "2026-01-01T00:00:00Z",
	) {
		const id = crypto.randomUUID();
		await db.execute(
			sql`INSERT INTO reading_run (id,user_id,book_id,started_at,state) VALUES (${id},${userId},${bookId},${startedAt},${state})`,
		);
		return id;
	}
	async function run(id: string) {
		const rows = await db.execute(
			sql`SELECT book_id, state, orphan_hash, orphan_server_id FROM reading_run WHERE id=${id}`,
		);
		const row = rows.rows[0] as
			| {
					book_id: string | null;
					state: string;
					orphan_hash: string | null;
					orphan_server_id: string | null;
			  }
			| undefined;
		return (
			row && {
				...row,
				book_id: row.book_id === null ? null : Number(row.book_id),
			}
		);
	}
	const removeBook = (id: number) =>
		db.execute(sql`DELETE FROM book WHERE id=${id}`);

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
			sql`INSERT INTO "user" (id,name,email,email_verified,username,created_at,updated_at) VALUES (${userId},'Preserve test',${`${userId}@example.test`},true,${userId},now(),now())`,
		);
		for (const id of servers)
			await db.execute(
				sql`INSERT INTO organization (id,name,slug,created_at) VALUES (${id},'Preserve test',${id},now())`,
			);
		await addLibrary("one", servers[0] as string);
		await addLibrary("two", servers[0] as string);
		await addLibrary("other", servers[1] as string);
	});
	afterAll(async () => {
		if (!db) return;
		for (const id of servers)
			await db.execute(sql`DELETE FROM organization WHERE id=${id}`);
		await db.execute(sql`DELETE FROM "user" WHERE id=${userId}`);
	});

	test("a moved file parks its history and the re-added copy adopts it", async () => {
		const hash = `moved-${tag}`;
		const before = await addBook("one", hash);
		const runId = await addRun(before);
		expect(await repo.preserveForRemoval({ bookId: before })).toEqual({
			moved: 0,
			parked: 1,
		});
		await removeBook(before);
		expect(await run(runId)).toMatchObject({
			book_id: null,
			orphan_hash: hash,
			orphan_server_id: servers[0],
		});
		const after = await addBook("one", hash);
		expect(await repo.adoptOrphans(after)).toBe(1);
		expect(await run(runId)).toEqual({
			book_id: after,
			state: "reading",
			orphan_hash: null,
			orphan_server_id: null,
		});
	});

	test("another copy of the file on the server takes the history at once", async () => {
		const hash = `twin-${tag}`;
		const gone = await addBook("one", hash);
		const twin = await addBook("two", hash);
		const runId = await addRun(gone, "finished");
		expect(await repo.preserveForRemoval({ bookId: gone })).toEqual({
			moved: 1,
			parked: 0,
		});
		await removeBook(gone);
		expect((await run(runId))?.book_id).toBe(twin);
	});

	test("an arriving current reading yields to the one already there", async () => {
		const hash = `conflict-${tag}`;
		const gone = await addBook("one", hash);
		const twin = await addBook("two", hash);
		const arriving = await addRun(gone);
		const staying = await addRun(twin);
		await repo.preserveForRemoval({ bookId: gone });
		await removeBook(gone);
		expect(await run(arriving)).toMatchObject({ book_id: twin, state: "left" });
		expect(await run(staying)).toMatchObject({
			book_id: twin,
			state: "reading",
		});
	});

	test("copies removed one after another keep a single current reading", async () => {
		const hash = `pair-${tag}`;
		const first = await addBook("one", hash);
		const second = await addBook("two", hash);
		const older = await addRun(first, "reading", "2026-01-01T00:00:00Z");
		const newer = await addRun(second, "reading", "2026-02-01T00:00:00Z");
		await repo.preserveForRemoval({ libraryId: libraries.one as number });
		await removeBook(first);
		await repo.preserveForRemoval({ libraryId: libraries.two as number });
		await removeBook(second);
		// The first removal hands over to the second copy; the second parks both.
		expect(await run(older)).toMatchObject({ book_id: null, state: "left" });
		expect(await run(newer)).toMatchObject({ book_id: null, state: "reading" });
		const returned = await addBook("one", hash);
		expect(await repo.adoptOrphans(returned)).toBe(2);
		expect(await run(older)).toMatchObject({
			book_id: returned,
			state: "left",
		});
		expect(await run(newer)).toMatchObject({
			book_id: returned,
			state: "reading",
		});
	});

	test("history never crosses to another server", async () => {
		const hash = `isolated-${tag}`;
		const gone = await addBook("one", hash);
		const runId = await addRun(gone);
		await repo.preserveForRemoval({ bookId: gone });
		await removeBook(gone);
		const elsewhere = await addBook("other", hash);
		expect(await repo.adoptOrphans(elsewhere)).toBe(0);
		expect((await run(runId))?.book_id).toBeNull();
	});

	test("deleting a server deletes its members' history", async () => {
		const hash = `server-${tag}`;
		const kept = await addBook("other", hash);
		const runId = await addRun(kept);
		await db.transaction((tx) =>
			repo.deleteForServer(tx, servers[1] as string),
		);
		expect(await run(runId)).toBeUndefined();
	});
	test("the overview counts removed books on the server and hides locked metadata", async () => {
		const segment = async (runId: string, at: string) => {
			const session = crypto.randomUUID();
			await db.execute(
				sql`INSERT INTO reading_session (id,run_id,started_at,ended_at,state,mode,source,device,installation_id,content_version,time_zone,character_count) VALUES (${session},${runId},${at},${at},'finished','automatic','web','test',${crypto.randomUUID()},'v1','UTC',1000)`,
			);
			await db.execute(
				sql`INSERT INTO reading_segment (id,session_id,started_at,ended_at,seconds,start_position,end_position,kind) VALUES (${crypto.randomUUID()},${session},${at},${new Date(Date.parse(at) + 600_000).toISOString()},600,0,0.5,'reading')`,
			);
		};
		const kept = await addBook("one", `overview-kept-${tag}`);
		const locked = await addBook("two", `overview-locked-${tag}`);
		const removed = await addBook("one", `overview-removed-${tag}`);
		const elsewhere = await addBook("other", `overview-other-${tag}`);
		for (const [book, at] of [
			[kept, "2026-02-01T10:00:00.000Z"],
			[locked, "2026-02-02T10:00:00.000Z"],
			[removed, "2026-02-03T10:00:00.000Z"],
			[elsewhere, "2026-02-04T10:00:00.000Z"],
		] as const)
			await segment(await addRun(book, "finished", at), at);
		await repo.preserveForRemoval({ bookId: removed });
		await removeBook(removed);
		const overview = await repo.overview(userId, servers[0] as string, [
			libraries.one as number,
		]);
		const days = overview.segments.map((s) =>
			new Date(s.started_at).toISOString().slice(0, 10),
		);
		expect(days).toContain("2026-02-01");
		expect(days).toContain("2026-02-02");
		expect(days).toContain("2026-02-03");
		expect(days).not.toContain("2026-02-04");
		const accessible = new Map(
			overview.books.map((b) => [Number(b.id), b.accessible]),
		);
		expect(accessible.get(kept)).toBe(true);
		expect(accessible.get(locked)).toBe(false);
	});
});
