import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	type FacetDefinition,
	type FacetRow,
	facetCountQuery,
	facetListQuery,
	pickFacetArtwork,
} from "../facet-list";

const GENRE_FACET: FacetDefinition = {
	table: sql`genre`,
	linkColumn: sql`genre_id`,
	links: { ebook: sql`book_genre`, audiobook: sql`audiobook_genre` },
};

const dialect = new PgDialect();
const toSql = (query: ReturnType<typeof facetListQuery>) =>
	dialect.sqlToQuery(query).sql;

const listOptions = {
	serverId: "server-1",
	limit: 30,
	offset: 0,
	sort: "name" as const,
	scope: "ALL" as const,
};

const row = (overrides: Partial<FacetRow> = {}): FacetRow => ({
	id: 1,
	uuid: "11111111-1111-1111-1111-111111111111",
	name: "action",
	bookCount: 3,
	covers: ["a.jpg"],
	colors: ["#ff0000"],
	squares: [false],
	...overrides,
});

describe("facetListQuery media types", () => {
	test("a single format only reads that format's tables", () => {
		const query = toSql(
			facetListQuery(GENRE_FACET, { ...listOptions, mediaType: "ebook" }),
		);
		expect(query).toContain("book_genre");
		expect(query).not.toContain("audiobook_genre");
		expect(query).not.toContain("audiobook_metadata");
	});

	test("audiobook candidates are flagged square without a union", () => {
		const query = toSql(
			facetListQuery(GENRE_FACET, { ...listOptions, mediaType: "audiobook" }),
		);
		expect(query).toContain("audiobook_metadata");
		expect(query).toContain("TRUE AS is_square");
		expect(query).not.toContain("UNION ALL");
	});

	test('"all" spans both link and metadata tables', () => {
		const query = toSql(
			facetListQuery(GENRE_FACET, { ...listOptions, mediaType: "all" }),
		);
		expect(query).toContain("book_genre");
		expect(query).toContain("audiobook_genre");
		expect(query).toContain("book_metadata");
		expect(query).toContain("audiobook_metadata");
		expect(query).toContain("md2.is_square");
	});

	test('"all" counts each book once', () => {
		const query = toSql(
			facetListQuery(GENRE_FACET, { ...listOptions, mediaType: "all" }),
		);
		expect(query).toContain("COUNT(DISTINCT b.id)");
	});

	test("names sort case-insensitively", () => {
		const query = toSql(
			facetListQuery(GENRE_FACET, { ...listOptions, mediaType: "all" }),
		);
		expect(query).toContain("lower(f.name) ASC");
	});

	test("the count query follows the same media type", () => {
		const both = dialect.sqlToQuery(
			facetCountQuery(GENRE_FACET, {
				serverId: "server-1",
				scope: "ALL",
				mediaType: "all",
			}),
		).sql;
		const ebook = dialect.sqlToQuery(
			facetCountQuery(GENRE_FACET, {
				serverId: "server-1",
				scope: "ALL",
				mediaType: "ebook",
			}),
		).sql;
		expect(both).toContain("audiobook_genre");
		expect(ebook).not.toContain("audiobook_genre");
	});
});

describe("pickFacetArtwork", () => {
	test("reports whether the chosen cover is square artwork", () => {
		const [picked] = pickFacetArtwork([
			row({ covers: ["square.jpg"], colors: ["#111111"], squares: [true] }),
		]);
		expect(picked).toEqual({
			cover: "square.jpg",
			mainColor: "#111111",
			square: true,
		});
	});

	test("the square flag travels with the cover actually picked", () => {
		const picked = pickFacetArtwork([
			row({
				uuid: "22222222-2222-2222-2222-222222222222",
				covers: ["a.jpg", "b.jpg"],
				colors: ["#aaaaaa", "#bbbbbb"],
				squares: [false, true],
			}),
			row({
				uuid: "33333333-3333-3333-3333-333333333333",
				covers: ["a.jpg", "b.jpg"],
				colors: ["#aaaaaa", "#bbbbbb"],
				squares: [false, true],
			}),
		]);
		// Neighbouring facets share candidates, so the second tile takes the other
		// cover — and must take that cover's own flag with it.
		expect(picked[0]?.cover).not.toBe(picked[1]?.cover);
		for (const item of picked) {
			expect(item?.square).toBe(item?.cover === "b.jpg");
		}
	});

	test("a facet with no covers is not square", () => {
		expect(pickFacetArtwork([row({ covers: null, squares: null })])).toEqual([
			{ cover: null, mainColor: null, square: false },
		]);
	});

	test("a missing flag falls back to the book frame", () => {
		const [picked] = pickFacetArtwork([row({ squares: null })]);
		expect(picked?.square).toBe(false);
	});
});
