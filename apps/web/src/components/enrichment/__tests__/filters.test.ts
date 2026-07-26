import { describe, expect, test } from "bun:test";
import { listInputFromSearch } from "../filters";

describe("listInputFromSearch", () => {
	test("defaults an empty URL to the in-progress first page", () => {
		expect(listInputFromSearch({})).toEqual({
			bucket: "in_progress",
			lifecycle: undefined,
			libraryUuid: undefined,
			mediaType: undefined,
			withFailures: undefined,
			query: undefined,
			sort: "recent",
			limit: 50,
			offset: 0,
		});
	});

	test("keeps a lifecycle the bucket offers as a chip", () => {
		expect(
			listInputFromSearch({ bucket: "attention", lifecycle: "no_match" })
				.lifecycle,
		).toBe("no_match");
	});

	test("drops a lifecycle belonging to another bucket", () => {
		// A stale ?lifecycle= from a shared link must not empty the list.
		expect(
			listInputFromSearch({ bucket: "completed", lifecycle: "running" })
				.lifecycle,
		).toBeUndefined();
	});

	test("treats the all-libraries sentinel as no filter", () => {
		expect(
			listInputFromSearch({ library: "__all__" }).libraryUuid,
		).toBeUndefined();
		expect(listInputFromSearch({ library: "lib-1" }).libraryUuid).toBe("lib-1");
	});

	test("trims the search box and omits it when empty", () => {
		expect(listInputFromSearch({}, { query: "  " }).query).toBeUndefined();
		expect(listInputFromSearch({}, { query: " hobbit " }).query).toBe("hobbit");
	});

	test("the loader and the component agree for the same URL", () => {
		// Same helper, same key — otherwise the prefetched page is wasted.
		const search = { bucket: "attention", library: "lib-1" } as const;
		expect(listInputFromSearch(search)).toEqual(
			listInputFromSearch(search, { offset: 0 }),
		);
	});
});
