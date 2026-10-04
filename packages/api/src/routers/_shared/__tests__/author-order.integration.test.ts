import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const enabled = process.env.AUTHOR_ORDER_INTEGRATION === "1";
describe.skipIf(!enabled)("author credit order", () => {
	const connection = {
		host: process.env.DB_HOST,
		port: Number(process.env.DB_PORT),
		user: process.env.DB_USER,
		password: process.env.DB_PASSWORD,
		database: process.env.DB_NAME,
	};
	const schema = `author_order_${crypto.randomUUID().replaceAll("-", "")}`;
	let admin: Pool;
	let pool: Pool;
	let loader: import("../batch-loaders").BatchLoaderRepository;

	beforeAll(async () => {
		admin = new Pool(connection);
		await admin.query(`CREATE SCHEMA ${schema}`);
		pool = new Pool({ ...connection, options: `-c search_path=${schema}` });
		await pool.query(`
			CREATE TABLE author(id bigint PRIMARY KEY, uuid uuid DEFAULT gen_random_uuid(), name text NOT NULL, provider text);
			CREATE TABLE book_author(book_id bigint, author_id bigint REFERENCES author, role text);
			CREATE TABLE audiobook_author(book_id bigint, author_id bigint REFERENCES author, role text);
			-- The illustrator is inserted first and sorts first by name ("a" < "川"),
			-- which is how cards ended up reading "abec +1".
			INSERT INTO author(id, name) VALUES (1, 'abec'), (2, '川原礫'), (3, 'のん');
			INSERT INTO book_author VALUES (10, 1, 'Illustrator'), (10, 2, 'Author'), (11, 3, 'Illustrator');
			INSERT INTO audiobook_author VALUES (20, 1, 'Illustrator'), (20, 2, NULL);
		`);
		mock.module("@nanahoshi/db", () => ({ db: drizzle(pool) }));
		const { BatchLoaderRepository } = await import("../batch-loaders");
		loader = new BatchLoaderRepository();
	});

	afterAll(async () => {
		await pool?.end();
		if (admin) {
			await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
			await admin.end();
		}
	});

	test("ebooks credit the writer before the illustrator", async () => {
		const authors = await loader.loadEbookAuthors([10]);
		expect(authors.get(10)?.map((a) => a.name)).toEqual(["川原礫", "abec"]);
	});

	test("a book with only an illustrator still shows that credit", async () => {
		const authors = await loader.loadEbookAuthors([11]);
		expect(authors.get(11)?.map((a) => a.name)).toEqual(["のん"]);
	});

	test("audiobooks treat a missing role as the writer", async () => {
		const authors = await loader.loadAudiobookAuthors([20]);
		expect(authors.get(20)?.map((a) => a.name)).toEqual(["川原礫", "abec"]);
	});
});
