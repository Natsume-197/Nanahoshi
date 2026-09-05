import { beforeEach, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();
const queries: { sql: string; params: unknown[] }[] = [];
let responses: Record<string, unknown>[][] = [];
const client = {
	query: mock(async (config: { text: string }, params: unknown[]) => {
		queries.push({ sql: config.text, params });
		return { rows: [] };
	}),
};
const database = drizzle({ client: client as never });
mock.module("@nanahoshi-v2/db", () => ({
	db: {
		select: database.select.bind(database),
		execute: mock(async (query: SQL) => {
			queries.push(dialect.sqlToQuery(query));
			return { rows: responses.shift() ?? [] };
		}),
	},
}));
const ebookAuthors = mock(async (_ids: number[]) => new Map());
const audiobookAuthors = mock(async (_ids: number[]) => new Map());
const narrators = mock(async (_ids: number[]) => new Map());
mock.module("../batch-loaders", () => ({
	batchLoaderRepository: {
		loadEbookAuthors: ebookAuthors,
		loadAudiobookAuthors: audiobookAuthors,
		loadNarrators: narrators,
	},
}));
const { BookRepository } = await import("../../books/book.repository");
const { AudiobookRepository } = await import(
	"../../audiobooks/audiobook.repository"
);
const { AuthorRepository } = await import("../../authors/author.repository");
const { SeriesRepository } = await import("../../series/series.repository");
const { ListBooksByEntityInput } = await import("../../books/book.model");
const books = new BookRepository();
const audio = new AudiobookRepository();

beforeEach(() => {
	queries.length = 0;
	responses = [];
	ebookAuthors.mockClear();
	audiobookAuthors.mockClear();
	narrators.mockClear();
});

test("batch hydration uses one scoped query and preserves ranking, omitting invisible IDs", async () => {
	for (const repository of [new AuthorRepository(), new SeriesRepository()]) {
		for (const size of [1, 6, 30]) {
			queries.length = 0;
			const ids = Array.from({ length: size }, (_, i) => `id-${i}`);
			responses = [
				ids
					.slice(0, -1)
					.reverse()
					.map((uuid) => ({ uuid, name: uuid, bookCount: 2 })),
			];
			const result = await repository.getVisibleHitsByUuids(
				ids,
				"server-a",
				[7],
			);
			expect(result.map((hit) => hit.uuid)).toEqual(ids.slice(0, -1));
			expect(queries).toHaveLength(1);
			expect(queries[0]?.sql).toContain("l.server_id =");
			expect(queries[0]?.sql).toContain("b.library_id IN");
			expect(queries[0]?.sql).toContain("b.duplicate_of_book_id IS NULL");
			expect(queries[0]?.params).toContain("server-a");
			expect(queries[0]?.params).toContain(7);
		}
		queries.length = 0;
		expect(await repository.getVisibleHitsByUuids([], "server-a", [])).toEqual(
			[],
		);
		expect(queries).toHaveLength(0);
		await repository.getVisibleHitsByUuids(["hidden"], "server-b", []);
		expect(queries[0]?.sql).toContain("AND false");
	}
});

test("entity pages keep format availability independent of search and hydrate only the page", async () => {
	responses = [
		[
			{ mediaType: "ebook", count: 1000, filteredCount: 41 },
			{ mediaType: "audiobook", count: 5, filteredCount: 0 },
		],
		Array.from({ length: 40 }, (_, id) => ({
			id,
			uuid: `book-${id}`,
			mediaType: "ebook",
			filename: "book.epub",
			title: "Title",
		})),
	];
	const result = await books.listByEntity(
		ListBooksByEntityInput.parse({
			kind: "genre",
			uuid: "00000000-0000-4000-8000-000000000001",
			query: "Title",
			sort: "author",
		}),
		"server-a",
		[7],
	);
	expect(result.books).toHaveLength(40);
	expect(result.nextCursor).toBe(40);
	expect(result.total).toBe(41);
	expect(result.formats).toEqual(["ebook", "audiobook"]);
	expect(result.format).toBe("ebook");
	expect(queries).toHaveLength(2);
	for (const query of queries) {
		expect(query.sql).toContain("e.server_id =");
		expect(query.sql).toContain("l.server_id =");
		expect(query.sql).toContain("b.library_id IN");
		expect(query.sql).toContain("b.duplicate_of_book_id IS NULL");
	}
	expect(queries[1]?.sql).toContain("LIMIT");
	expect(queries[1]?.sql).toContain("OFFSET");
	expect(queries[1]?.sql).not.toContain("audiobook_metadata");
	expect(ebookAuthors.mock.calls[0]?.[0]).toHaveLength(40);
	expect(audiobookAuthors.mock.calls[0]?.[0]).toEqual([]);
});

test("empty permissions and exhausted pages never hydrate; publisher never queries audio", async () => {
	const input = ListBooksByEntityInput.parse({
		kind: "publisher",
		uuid: "00000000-0000-4000-8000-000000000001",
	});
	expect((await books.listByEntity(input, "server-a", [])).books).toEqual([]);
	expect(queries).toHaveLength(1);
	expect(queries[0]?.sql).toContain("AND false");
	expect(queries[0]?.sql).not.toContain("audiobook_metadata");
	expect(ebookAuthors).not.toHaveBeenCalled();
	responses = [[{ mediaType: "ebook", count: 40, filteredCount: 40 }]];
	const last = await books.listByEntity(
		{ ...input, cursor: 40 },
		"server-a",
		"ALL",
	);
	expect(last).toMatchObject({ books: [], total: 40, nextCursor: null });
	expect(ebookAuthors).not.toHaveBeenCalled();
});

test("compact audio skips narrators while default callers retain them", async () => {
	await audio.listRecent(20, "server-a", [7], true);
	await audio.listRandom(15, "server-a", [7], true);
	expect(narrators).not.toHaveBeenCalled();
	await audio.listRecent(20, "server-a", [7]);
	await audio.listRandom(15, "server-a", [7]);
	expect(narrators).toHaveBeenCalledTimes(2);
});

test("random queries sample scoped IDs before joining metadata and retain random ordering", async () => {
	for (const repository of [books, audio]) {
		queries.length = 0;
		await repository.listRandom(15, "server-a", [7]);
		const query = queries[0];
		expect(query?.sql).toMatch(
			/inner join \(select .*RANDOM\(\).*limit .*\) "sample"/,
		);
		expect(query?.sql.indexOf(') "sample"')).toBeLessThan(
			query?.sql.indexOf("left join") ?? 0,
		);
		expect(query?.sql).toMatch(/order by "rank"$/);
		expect(query?.params).toContain("server-a");
		expect(query?.params).toContain(7);
		expect(query?.params).toContain(15);
	}
});

test("compact recent books do not select description or publisher metadata", async () => {
	await books.listRecent(20, "server-a", [7], true);
	expect(queries[0]?.sql).not.toContain('"book_metadata"."description"');
	expect(queries[0]?.sql).not.toContain('"publisher"."name"');
	expect(queries[0]?.sql).toContain('left join "publisher" on false');
	queries.length = 0;
	await books.listRecent(20, "server-a", [7]);
	expect(queries[0]?.sql).toContain('"book_metadata"."description"');
	expect(queries[0]?.sql).toContain('"publisher"."name"');
});

test("entity text search preserves filename matches and treats wildcard characters literally", async () => {
	responses = [
		[{ mediaType: "ebook", count: 1000, filteredCount: 1 }],
		[
			{
				id: 2,
				uuid: "found",
				filename: "100%_real.epub",
				title: "A different title",
				mediaType: "ebook",
			},
		],
	];
	const result = await books.listByEntity(
		ListBooksByEntityInput.parse({
			kind: "genre",
			uuid: "00000000-0000-4000-8000-000000000001",
			query: "%_",
		}),
		"server-a",
		[7],
	);
	expect(result.books).toHaveLength(1);
	for (const query of queries) {
		expect(query.sql).toContain("md.title ILIKE");
		expect(query.sql).toContain("OR b.filename ILIKE");
		expect(query.params).toContain("%\\%\\_%");
	}
});
