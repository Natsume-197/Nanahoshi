import path from "node:path";
import { pool } from "../src/index";

const migrationPath = path.join(
	import.meta.dir,
	"../src/migrations/0093_sanitize_embedded_path_titles.sql",
);
const statements = (await Bun.file(migrationPath).text())
	.split("--> statement-breakpoint")
	.map((statement) => statement.trim())
	.filter(Boolean);

const client = await pool.connect();
try {
	await client.query("begin");
	await client.query(
		'create temp table "book_metadata" ("title" text not null)',
	);
	await client.query(
		'create temp table "audiobook_metadata" ("title" text not null)',
	);
	await client.query(
		`insert into "book_metadata" ("title") values ('/library/Alice.epub'), ('Already clean')`,
	);
	await client.query(
		`insert into "audiobook_metadata" ("title") values ('C:\\Audio\\Dune.m4b'), ('Already clean')`,
	);
	for (const statement of statements) await client.query(statement);

	const books = await client.query<{ title: string }>(
		'select "title" from "book_metadata" order by "title"',
	);
	const audio = await client.query<{ title: string }>(
		'select "title" from "audiobook_metadata" order by "title"',
	);
	if (books.rows.map((row) => row.title).join("|") !== "Alice|Already clean") {
		throw new Error(`Unexpected ebook titles: ${JSON.stringify(books.rows)}`);
	}
	if (audio.rows.map((row) => row.title).join("|") !== "Already clean|Dune") {
		throw new Error(
			`Unexpected audiobook titles: ${JSON.stringify(audio.rows)}`,
		);
	}
} finally {
	await client.query("rollback").catch(() => undefined);
	client.release();
	await pool.end();
}
