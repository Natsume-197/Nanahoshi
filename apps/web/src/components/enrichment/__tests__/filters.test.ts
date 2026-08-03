import { describe, expect, test } from "bun:test";
import { LIFECYCLE_BUCKET, listInputFromSearch } from "../filters";

describe("listInputFromSearch", () => {
	test("defaults an empty URL to every bucket, first page", () => {
		// The sidebar's root row is bucket-less: the server reads that as "every
		// bucket except archived".
		expect(listInputFromSearch({})).toEqual({
			bucket: undefined,
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

	test("sends the selected bucket through", () => {
		expect(listInputFromSearch({ bucket: "attention" }).bucket).toBe(
			"attention",
		);
	});

	test("keeps a lifecycle that belongs to the selected bucket", () => {
		expect(
			listInputFromSearch({ bucket: "attention", lifecycle: "no_match" })
				.lifecycle,
		).toBe("no_match");
	});

	test("keeps a single-lifecycle bucket's own lifecycle", () => {
		// The sidebar sends bucket+lifecycle together even where the bucket holds
		// exactly one lifecycle; narrowing must not be treated as a stale link.
		expect(
			listInputFromSearch({ bucket: "history", lifecycle: "archived" })
				.lifecycle,
		).toBe("archived");
	});

	test("drops a lifecycle belonging to another bucket", () => {
		// A stale ?lifecycle= from a shared link must not empty the list.
		expect(
			listInputFromSearch({ bucket: "completed", lifecycle: "running" })
				.lifecycle,
		).toBeUndefined();
	});

	test("drops any lifecycle under the all-buckets root", () => {
		expect(
			listInputFromSearch({ bucket: "all", lifecycle: "running" }).lifecycle,
		).toBeUndefined();
	});

	test("every lifecycle the sidebar offers maps back to its own bucket", () => {
		// LIFECYCLE_BUCKET mirrors the API's map; if they drift, sidebar clicks
		// would send pairs listInputFromSearch throws away.
		for (const lifecycle of Object.keys(
			LIFECYCLE_BUCKET,
		) as (keyof typeof LIFECYCLE_BUCKET)[]) {
			expect(
				listInputFromSearch({ bucket: LIFECYCLE_BUCKET[lifecycle], lifecycle })
					.lifecycle,
			).toBe(lifecycle);
		}
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
