import { describe, expect, test } from "bun:test";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";

process.env.VITE_SERVER_URL ||= "http://localhost:3000";
const { allCatalogOptions, retainCatalogData } = await import(
	"./catalog-queries"
);
const { readCollectionViewState } = await import("@/hooks/use-collection-view");
const { saveUiSnapshot } = await import("@/lib/scroll-restoration");

describe("catalog navigation", () => {
	test("restored state and the mounted query use the same prefetch key", () => {
		const location = {
			href: "/dashboard/books?library=one",
			state: { __TSR_key: "catalog-back" },
		};
		saveUiSnapshot("catalog-back:nh-books-view", {
			sort: "title",
			search: "  Alice  ",
		});
		const saved = readCollectionViewState<"title" | "recent">(
			location,
			"nh-books-view",
			"recent",
		);
		const prefetched = allCatalogOptions({
			format: "ebook",
			sort: saved.sort,
			query: saved.search,
			libraryUuid: "one",
		});
		const mounted = allCatalogOptions({
			format: "ebook",
			sort: "title",
			query: "Alice",
			libraryUuid: "one",
		});
		expect(prefetched.queryKey).toEqual(mounted.queryKey);
		expect(
			allCatalogOptions({ format: "audiobook", sort: "rating" }).queryKey,
		).toEqual(
			allCatalogOptions({ format: "audiobook", sort: "recent" }).queryKey,
		);
	});

	test("mount reuses an in-flight first-page prefetch", async () => {
		const client = new QueryClient({
			defaultOptions: { queries: { staleTime: 60_000 } },
		});
		let calls = 0;
		let resolve!: (value: never[]) => void;
		const options = {
			...allCatalogOptions({ format: "ebook", sort: "recent" }),
			queryFn: () => {
				calls++;
				return new Promise<never[]>((done) => {
					resolve = done;
				});
			},
		};
		const prefetch = client.prefetchInfiniteQuery(options);
		const observer = new InfiniteQueryObserver(client, options);
		const unsubscribe = observer.subscribe(() => {});
		expect(calls).toBe(1);
		resolve([]);
		await prefetch;
		expect(observer.getCurrentResult().data?.pages).toEqual([[]]);
		expect(calls).toBe(1);
		unsubscribe();
		client.clear();
	});

	test("retains same-scope cards only until replacement settles, never after cache removal", async () => {
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const cache = client.getQueryCache();
		const previous = cache.build(client, {
			queryKey: ["catalog", "recent"],
			meta: { catalogScope: "user:server" },
		});
		const cards = { pages: [[{ uuid: "first" }]], pageParams: [0] };
		previous.setData(cards);
		expect(retainCatalogData(cards, previous, "user:server", cache)).toBe(
			cards,
		);
		expect(
			retainCatalogData(cards, previous, "user:another-server", cache),
		).toBeUndefined();
		let reject!: (reason: Error) => void;
		const options = {
			queryKey: previous.queryKey,
			meta: { catalogScope: "user:server" },
			queryFn: () =>
				new Promise<{ uuid: string }[]>((_, fail) => {
					reject = fail;
				}),
			initialPageParam: 0,
			getNextPageParam: () => undefined,
			placeholderData: (
				data: typeof cards | undefined,
				query: Parameters<typeof retainCatalogData>[1],
			) => retainCatalogData(data, query, "user:server", cache),
			staleTime: Number.POSITIVE_INFINITY,
		};
		const observer = new InfiniteQueryObserver(client, options);
		const unsubscribe = observer.subscribe(() => {});
		observer.setOptions({ ...options, queryKey: ["catalog", "title"] });
		expect(observer.getCurrentResult().isPlaceholderData).toBe(true);
		expect(observer.getCurrentResult().data).toBe(cards);
		reject(new Error("unavailable"));
		await new Promise((done) => setTimeout(done, 0));
		expect(observer.getCurrentResult().isError).toBe(true);
		expect(observer.getCurrentResult().data).toBeUndefined();
		previous.invalidate();
		expect(
			retainCatalogData(cards, previous, "user:server", cache),
		).toBeUndefined();
		previous.setData(cards);
		cache.remove(previous);
		expect(
			retainCatalogData(cards, previous, "user:server", cache),
		).toBeUndefined();
		unsubscribe();
		client.clear();
	});
});
