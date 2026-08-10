import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * Real-Postgres coverage for deleting a populated server.
 *
 * Run with dev infrastructure up:
 *   SERVER_DELETE_INTEGRATION=1 bun test --env-file=apps/server/.env \
 *     packages/api/src/routers/server-profile/__tests__/server-profile.delete.integration.test.ts
 */
const enabled = process.env.SERVER_DELETE_INTEGRATION === "1";

describe.skipIf(!enabled)("server deletion integration", () => {
	let db: typeof import("@nanahoshi-v2/db").db;
	let pool: typeof import("@nanahoshi-v2/db").pool;
	let sql: typeof import("drizzle-orm").sql;
	let deleteServer: typeof import("../server-profile.router").serverProfileRouter.deleteServer;
	let callAs: typeof import("../../../__tests__/helpers/authHarness").callAs;

	const serverId = `server-delete-${crypto.randomUUID()}`;
	const ownerId = `server-owner-${crypto.randomUUID()}`;
	let ebookLibraryId = 0;
	let audiobookLibraryId = 0;

	beforeAll(async () => {
		({ db, pool } = await import("@nanahoshi-v2/db"));
		({ sql } = await import("drizzle-orm"));
		({ deleteServer } = (
			await import("../server-profile.router")
		).serverProfileRouter);
		({ callAs } = await import("../../../__tests__/helpers/authHarness"));
		const { runMigrations } = await import("@nanahoshi-v2/db/migrate");
		await runMigrations();

		await db.execute(sql`
			insert into "user" (
				id,
				name,
				email,
				email_verified,
				username,
				created_at,
				updated_at
			)
			values (
				${ownerId},
				'server delete owner',
				${`${ownerId}@test.local`},
				true,
				${ownerId},
				now(),
				now()
			)
		`);
		await db.execute(sql`
			insert into organization (id, name, slug, created_at)
			values (
				${serverId},
				'server delete integration',
				${`server-delete-${crypto.randomUUID()}`},
				now()
			)
		`);
		await db.execute(sql`
			insert into member (
				id,
				organization_id,
				user_id,
				role,
				created_at
			)
			values (
				${crypto.randomUUID()},
				${serverId},
				${ownerId},
				'owner',
				now()
			)
		`);

		const libraries = await db.execute(sql`
			insert into library (name, server_id, media_type, created_at)
			values
				('server delete ebook', ${serverId}, 'ebook', now()),
				('server delete audiobook', ${serverId}, 'audiobook', now())
			returning id, media_type
		`);
		for (const row of libraries.rows as Array<{
			id: number;
			media_type: string;
		}>) {
			if (row.media_type === "ebook") ebookLibraryId = Number(row.id);
			else audiobookLibraryId = Number(row.id);
		}

		const publisher = await db.execute(sql`
			insert into publisher (name, server_id)
			values ('server delete publisher', ${serverId})
			returning id
		`);
		const publisherId = Number((publisher.rows[0] as { id: number }).id);
		const series = await db.execute(sql`
			insert into series (name, server_id)
			values ('server delete series', ${serverId})
			returning id
		`);
		const seriesId = Number((series.rows[0] as { id: number }).id);

		const books = await db.execute(sql`
			insert into book (filename, filehash, uuid, library_id, media_type, created_at)
			values
				(
					'server-delete.epub',
					${`server-delete-ebook-${crypto.randomUUID()}`},
					${crypto.randomUUID()},
					${ebookLibraryId},
					'ebook',
					now()
				),
				(
					'server-delete.m4b',
					${`server-delete-audiobook-${crypto.randomUUID()}`},
					${crypto.randomUUID()},
					${audiobookLibraryId},
					'audiobook',
					now()
				)
			returning id, media_type
		`);
		let ebookId = 0;
		let audiobookId = 0;
		for (const row of books.rows as Array<{ id: number; media_type: string }>) {
			if (row.media_type === "ebook") ebookId = Number(row.id);
			else audiobookId = Number(row.id);
		}

		await db.execute(sql`
			insert into book_metadata (book_id, title, publisher_id)
			values (${ebookId}, 'server delete ebook', ${publisherId})
		`);
		await db.execute(sql`
			insert into audiobook_metadata (book_id, title, publisher_id)
			values (${audiobookId}, 'server delete audiobook', ${publisherId})
		`);
		await db.execute(sql`
			insert into book_series (series_id, book_id, position)
			values (${seriesId}, ${ebookId}, 1)
		`);
		await db.execute(sql`
			insert into audiobook_series (series_id, book_id, position)
			values (${seriesId}, ${audiobookId}, 1)
		`);
	});

	afterAll(async () => {
		if (db && sql) {
			// If the assertion failed before the server cascade completed, remove the
			// books first so cleanup is not blocked by the constraints under test.
			await db
				.execute(sql`
					delete from book
					where library_id in (
						select id from library where server_id = ${serverId}
					)
				`)
				.catch(() => {});
			await db
				.execute(sql`delete from organization where id = ${serverId}`)
				.catch(() => {});
			await db
				.execute(sql`delete from "user" where id = ${ownerId}`)
				.catch(() => {});
		}
		if (pool) await pool.end().catch(() => {});
	});

	test("lets the owner delete a server containing catalog metadata", async () => {
		await expect(
			callAs(deleteServer, undefined, {
				userId: ownerId,
				activeOrganizationId: serverId,
			}),
		).resolves.toEqual({ success: true });

		const remaining = await db.execute(sql`
			select count(*)::int as count
			from organization
			where id = ${serverId}
		`);
		expect(Number((remaining.rows[0] as { count: number }).count)).toBe(0);
	});
});
