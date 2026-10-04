import { expect, test } from "bun:test";
import {
	audiobookCandidateMeta,
	BOOK_PROVIDER_OPTIONS,
	bookCandidateMeta,
	canSearchMatch,
	defaultSelectedFields,
	displayMetadataValue,
	type MatchCandidate,
	matchFieldLabel,
	previewCoverUrl,
	providerFailureStatus,
	searchProviders,
	splitCandidates,
} from "../fix-match";

const candidate = (provider: string, providerId: string): MatchCandidate => ({
	provider,
	providerId,
	title: providerId,
	metaLines: [],
});

test("one provider failing never hides the others' results", async () => {
	const seen: Record<string, unknown>[] = [];
	const result = await searchProviders(
		{
			providerIds: ["amazon", "ranobedb", "googlebooks"],
			title: "  Title ",
			author: "",
			asin: "B0X",
			withAsin: true,
		},
		async (params) => {
			seen.push(params);
			if (params.provider === "amazon")
				throw new Error("429 Too_Many_Requests");
			if (params.provider === "ranobedb") return [candidate("ranobedb", "1")];
			return [];
		},
		BOOK_PROVIDER_OPTIONS,
	);
	expect(seen.map((params) => [params.provider, params.asin])).toEqual([
		["amazon", "B0X"],
		["ranobedb", undefined],
		["googlebooks", undefined],
	]);
	expect(seen[0]?.title).toBe("Title");
	expect(result.candidates.map((c) => c.providerId)).toEqual(["1"]);
	expect(result.outcomes.map((o) => [o.provider, o.status, o.count])).toEqual([
		["amazon", "rate_limited", 0],
		["ranobedb", "found", 1],
		["googlebooks", "no_results", 0],
	]);
});

test("provider errors are told apart", () => {
	expect(providerFailureStatus({ message: "Invalid API key" })).toBe(
		"invalid_credentials",
	);
	expect(providerFailureStatus({ cause: { code: "UNAUTHORIZED" } })).toBe(
		"invalid_credentials",
	);
	expect(providerFailureStatus(new Error("boom"))).toBe("failed");
});

test("an ASIN alone can search, but only on a source that takes one", () => {
	const amazon = new Set(["amazon"]);
	const ranobe = new Set(["ranobedb"]);
	expect(canSearchMatch(BOOK_PROVIDER_OPTIONS, amazon, "", "B0X")).toEqual({
		showAsin: true,
		canSearch: true,
	});
	expect(canSearchMatch(BOOK_PROVIDER_OPTIONS, ranobe, "", "B0X")).toEqual({
		showAsin: false,
		canSearch: false,
	});
	expect(
		canSearchMatch(BOOK_PROVIDER_OPTIONS, new Set(), "T", "").canSearch,
	).toBe(false);
});

test("suggestions stay apart from results and drop providers no longer offered", () => {
	const split = splitCandidates(
		BOOK_PROVIDER_OPTIONS,
		[candidate("amazon", "a"), candidate("gone", "g")],
		[candidate("amazon", "a"), candidate("amazon", "b")],
	);
	expect(split.suggestions.map((c) => c.providerId)).toEqual(["a"]);
	expect(split.results?.map((c) => c.providerId)).toEqual(["b"]);
	expect(splitCandidates(BOOK_PROVIDER_OPTIONS, [], null).results).toBeNull();
});

test("by default a match fills what's missing, never what's locked", () => {
	const selected = defaultSelectedFields(
		["title", "description", "cover", "tags"],
		{
			metadata: { title: "New", description: "D", cover: "c.jpg", tags: null },
			lockedFields: ["cover"],
		},
		{ title: "Old", description: "" },
	);
	expect([...selected]).toEqual(["description"]);
});

test("candidates describe themselves in short lines", () => {
	expect(
		bookCandidateMeta({
			authors: [{ name: "A" }, { name: "B" }],
			series: { name: "Saga", position: 3 },
			publishedDate: "2019-04-01",
		}),
	).toEqual(["A, B", "Saga #3 · 2019"]);
	expect(
		audiobookCandidateMeta(
			{
				narrators: [{ name: "N" }],
				series: { name: "Saga", sequence: "1-2", position: 1 },
				duration: 3600,
			},
			() => "1h",
		),
	).toEqual(["N", "Saga · 1-2 · 1h"]);
	expect(displayMetadataValue([{ name: "x" }, "y"])).toBe("x, y");
	expect(displayMetadataValue("")).toBe("—");
});

test("Google Books previews ask for the thumbnail that exists", () => {
	expect(
		previewCoverUrl("https://books.google.com/books/content?id=x&zoom=0"),
	).toBe("https://books.google.com/books/content?id=x&zoom=1");
	expect(previewCoverUrl("https://m.media-amazon.com/a.jpg")).toBe(
		"https://m.media-amazon.com/a.jpg",
	);
	expect(previewCoverUrl(null)).toBeNull();
});

test("the same entry found by two sources is listed once", async () => {
	const result = await searchProviders(
		{
			providerIds: ["amazon", "googlebooks"],
			title: "T",
			author: "",
			asin: "",
			withAsin: false,
		},
		async () => [candidate("amazon", "B0X")],
		BOOK_PROVIDER_OPTIONS,
	);
	expect(result.candidates).toHaveLength(1);
	expect(result.outcomes.map((o) => o.count)).toEqual([1, 1]);
});

test("preview fields read like the edit form's", () => {
	const translate = (key: string) => `<${key}>`;
	expect(matchFieldLabel("pageCount", translate)).toBe(
		"<book.meta_page_count>",
	);
	expect(matchFieldLabel("isbn13", translate)).toBe("ISBN-13");
	expect(matchFieldLabel("abridged", translate)).toBe("Abridged");
});
