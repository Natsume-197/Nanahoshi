import { describe, expect, test } from "bun:test";
import {
	buildFacts,
	type DetailMetadata,
	diffFacts,
	dominantSource,
	editFieldFor,
	factSource,
	missingFacts,
	resolveSituation,
} from "./detail-facts";

const empty: DetailMetadata = {
	subtitle: null,
	description: null,
	publishedDate: null,
	languageCode: null,
	isbn: null,
	asin: null,
	pageCount: null,
	duration: null,
	publisher: null,
	authors: [],
	narrators: [],
	series: null,
	genres: [],
};

describe("buildFacts", () => {
	test("an empty book only flags the essential gaps", () => {
		const facts = buildFacts(empty, "ebook");
		expect(facts.map((fact) => fact.key)).toEqual([
			"authors",
			"publisher",
			"published",
			"genres",
			"description",
		]);
		expect(missingFacts(facts)).toHaveLength(5);
	});

	test("optional facts appear only when present", () => {
		const facts = buildFacts(
			{
				...empty,
				series: { name: "Honzuki", position: "3" },
				isbn: "978",
				pageCount: 300,
			},
			"ebook",
		);
		const keys = facts.map((fact) => fact.key);
		expect(keys).toContain("series");
		expect(keys).toContain("identifiers");
		expect(keys).toContain("length");
		expect(keys).not.toContain("narrators");
	});

	test("audiobooks measure length by duration and list narrators", () => {
		const facts = buildFacts(
			{ ...empty, duration: 3600, pageCount: 10, narrators: ["A"] },
			"audiobook",
		);
		expect(facts.find((fact) => fact.key === "length")?.present).toBe(true);
		expect(facts.find((fact) => fact.key === "narrators")?.present).toBe(true);
		expect(
			buildFacts({ ...empty, pageCount: 10 }, "audiobook").some(
				(fact) => fact.key === "length",
			),
		).toBe(false);
	});

	test("a whitespace-only description counts as missing", () => {
		const facts = buildFacts({ ...empty, description: "  \n" }, "ebook");
		expect(missingFacts(facts)).toContain("description");
	});
});

describe("factSource", () => {
	test("identifiers fall back through isbn13 → asin and see locks on any key", () => {
		const [fact] = buildFacts({ ...empty, asin: "B0" }, "ebook").filter(
			(entry) => entry.key === "identifiers",
		);
		if (!fact) throw new Error("identifiers fact missing");
		expect(
			factSource(fact, { asin: { p: "amazon" } }, new Set(["isbn13"])),
		).toEqual({ provider: "amazon", locked: true });
		expect(factSource(fact, {}, new Set())).toEqual({
			provider: null,
			locked: false,
		});
	});
});

describe("resolveSituation", () => {
	test("candidates turn an attention state into a pick", () => {
		expect(resolveSituation("unresolved", true)).toBe("ambiguous");
		expect(resolveSituation("unresolved", false)).toBe("unresolved");
	});

	test("an in-flight run wins over stale candidates", () => {
		expect(resolveSituation("running", true)).toBe("running");
		expect(resolveSituation("scheduled", true)).toBe("scheduled");
	});
});

describe("cover fact", () => {
	test("only appears when the caller knows about the cover", () => {
		expect(buildFacts(empty, "ebook").some((f) => f.key === "cover")).toBe(
			false,
		);
		const facts = buildFacts(empty, "ebook", { hasCover: false });
		expect(missingFacts(facts)).toContain("cover");
		expect(
			missingFacts(buildFacts(empty, "ebook", { hasCover: true })),
		).not.toContain("cover");
	});
});

describe("diffFacts", () => {
	const current: DetailMetadata = {
		...empty,
		authors: ["Homer"],
		publisher: "Old House",
		genres: ["Epic"],
	};
	const incoming: DetailMetadata = {
		...empty,
		authors: ["Homer"],
		publisher: "Norton",
		description: "The voyage home",
		genres: ["epic"],
		isbn: "978",
	};

	test("classifies each field by what applying the record would do", () => {
		const byKey = Object.fromEntries(
			diffFacts(current, incoming, new Set(), "ebook").map((row) => [
				row.key,
				row,
			]),
		);
		expect(byKey.authors?.change).toBe("same");
		expect(byKey.publisher).toMatchObject({
			change: "changes",
			before: "Old House",
			after: "Norton",
		});
		expect(byKey.description?.change).toBe("adds");
		expect(byKey.identifiers?.change).toBe("adds");
		// Genre casing is normalized: same set, no change.
		expect(byKey.genres?.change).toBe("same");
		// The record has no series: the current value is kept untouched.
		expect(byKey.series?.change).toBe("keeps");
		expect(byKey.narrators).toBeUndefined();
	});

	test("a hand-edited field is reported as kept, not changed", () => {
		const publisher = diffFacts(
			current,
			incoming,
			new Set(["publisher"]),
			"ebook",
		).find((row) => row.key === "publisher");
		expect(publisher?.change).toBe("locked");
		const isbn = diffFacts(
			current,
			incoming,
			new Set(["isbn13"]),
			"ebook",
		).find((row) => row.key === "identifiers");
		expect(isbn?.change).toBe("locked");
	});

	test("audiobooks compare narrators and duration", () => {
		const rows = diffFacts(
			{ ...empty },
			{ ...empty, narrators: ["Voice"], duration: 3600 },
			new Set(),
			"audiobook",
		);
		expect(rows.find((row) => row.key === "narrators")?.change).toBe("adds");
		expect(rows.find((row) => row.key === "length")?.change).toBe("adds");
	});
});

describe("editFieldFor", () => {
	test("maps facts onto the edit dialog's inputs", () => {
		expect(editFieldFor("series", "ebook")).toBe("seriesName");
		expect(editFieldFor("published", "ebook")).toBe("publishedDate");
		expect(editFieldFor("identifiers", "ebook")).toBe("isbn13");
		expect(editFieldFor("identifiers", "audiobook")).toBe("isbn");
		expect(editFieldFor("length", "audiobook")).toBeNull();
		expect(editFieldFor("cover", "ebook")).toBeNull();
		expect(editFieldFor("description", "ebook")).toBe("description");
	});
});

describe("dominantSource", () => {
	const facts = buildFacts(
		{
			...empty,
			authors: ["A"],
			publisher: "P",
			publishedDate: "2020-01-01",
			description: "D",
		},
		"ebook",
	);

	test("names the source most rows share", () => {
		expect(
			dominantSource(facts, {
				authors: { p: "local" },
				publisher: { p: "local" },
				publishedDate: { p: "local" },
				description: { p: "amazon" },
			}),
		).toBe("local");
	});

	test("stays silent when no source covers half the rows", () => {
		expect(
			dominantSource(facts, {
				authors: { p: "local" },
				publisher: { p: "amazon" },
				publishedDate: { p: "ranobedb" },
			}),
		).toBeNull();
		expect(dominantSource(facts, { authors: { p: "local" } })).toBeNull();
	});
});
