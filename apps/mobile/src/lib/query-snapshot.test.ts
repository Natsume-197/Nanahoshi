import { describe, expect, it } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
	restoreQueries,
	SNAPSHOT_MAX_AGE,
	SNAPSHOT_MAX_QUERIES,
	serializeQueries,
} from "./query-snapshot";

const orpcKey = (path: string[], input: unknown): unknown[] => [
	path,
	{ type: "query", input },
];

function roundTrip(source: QueryClient, now?: number) {
	const text = serializeQueries(source);
	if (!text) throw new Error("nothing saved");
	const target = new QueryClient();
	restoreQueries(target, text, now);
	return target;
}

describe("query snapshot", () => {
	it("a cold start gets the server's answers back, Dates still Dates", () => {
		const source = new QueryClient();
		const key = orpcKey(["books", "listRecent"], { limit: 10 });
		const createdAt = new Date("2026-09-30T10:00:00Z");
		source.setQueryData(key, [{ uuid: "a", createdAt }]);

		const restored =
			roundTrip(source).getQueryData<{ uuid: string; createdAt: Date }[]>(key);
		expect(restored?.[0]?.uuid).toBe("a");
		expect(restored?.[0]?.createdAt).toBeInstanceOf(Date);
		expect(restored?.[0]?.createdAt.getTime()).toBe(createdAt.getTime());
	});

	it("leaves out hand-keyed queries (book files, searches)", () => {
		const source = new QueryClient();
		source.setQueryData(["reader-book", "uuid"], { bytes: "…" });
		source.setQueryData(orpcKey(["libraries", "getLibraries"], {}), []);

		const target = roundTrip(source);
		expect(target.getQueryData(["reader-book", "uuid"])).toBeUndefined();
		expect(
			target.getQueryData<unknown>(orpcKey(["libraries", "getLibraries"], {})),
		).toEqual([]);
	});

	it("an infinite list comes back with its first page only", () => {
		const source = new QueryClient();
		const key: unknown[] = [
			["books", "listAll"],
			{ type: "infinite", input: {} },
		];
		source.setQueryData(key, {
			pages: [["p1"], ["p2"], ["p3"]],
			pageParams: [0, 1, 2],
		});

		expect(roundTrip(source).getQueryData<unknown>(key)).toEqual({
			pages: [["p1"]],
			pageParams: [0],
		});
	});

	it("drops answers too old to show", () => {
		const source = new QueryClient();
		const key = orpcKey(["books", "listRecent"], {});
		source.setQueryData(key, ["old"]);

		const later = Date.now() + SNAPSHOT_MAX_AGE + 1;
		expect(roundTrip(source, later).getQueryData(key)).toBeUndefined();
	});

	it("restored answers are stale, so screens refetch them", () => {
		const source = new QueryClient();
		const key = orpcKey(["books", "listRecent"], {});
		source.setQueryData(key, ["x"], { updatedAt: Date.now() - 60 * 60_000 });

		const target = roundTrip(source);
		const query = target.getQueryCache().find({ queryKey: key });
		expect(query?.isStaleByTime(5 * 60_000)).toBe(true);
	});
});

describe("query snapshot size", () => {
	it("keeps the screens in use and the newest answers, up to the cap", () => {
		const source = new QueryClient();
		const onScreen = orpcKey(["books", "listRecent"], { limit: 20 });
		// Older than every detail page, yet kept: it is on screen.
		source.setQueryData(onScreen, ["home"], {
			updatedAt: Date.now() - 24 * 60 * 60_000,
		});
		const observer = new QueryObserver(source, {
			queryKey: onScreen,
			enabled: false,
		});
		const unsubscribe = observer.subscribe(() => {});
		for (let index = 0; index < SNAPSHOT_MAX_QUERIES + 10; index++)
			source.setQueryData(
				orpcKey(["books", "getBookWithMetadata"], { uuid: `b${index}` }),
				{ uuid: `b${index}` },
				{ updatedAt: Date.now() - index * 1000 },
			);

		const target = roundTrip(source);
		unsubscribe();
		expect(target.getQueryData<unknown>(onScreen)).toEqual(["home"]);
		const detail = (index: number) =>
			target.getQueryData<unknown>(
				orpcKey(["books", "getBookWithMetadata"], { uuid: `b${index}` }),
			);
		expect(detail(0)).toEqual({ uuid: "b0" });
		expect(detail(SNAPSHOT_MAX_QUERIES + 9)).toBeUndefined();
		expect(target.getQueryCache().getAll()).toHaveLength(SNAPSHOT_MAX_QUERIES);
	});
});
