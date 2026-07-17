import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { fetchLoaderQuery } from "../loader-query";

// fetchLoaderQuery only caches in the browser; give the bun test runtime a
// window so the cache path runs (restored afterAll).
const hadWindow = "window" in globalThis;
beforeAll(() => {
	if (!hadWindow) (globalThis as { window?: object }).window = {};
});
afterAll(() => {
	if (!hadWindow) delete (globalThis as { window?: object }).window;
});

const key = (uuid: string) => ["loader", "book-detail", uuid] as const;

function counting(value: string) {
	let calls = 0;
	return {
		fn: async () => {
			calls += 1;
			return `${value}-${calls}`;
		},
		get calls() {
			return calls;
		},
	};
}

describe("fetchLoaderQuery", () => {
	it("preload then navigation share one request", async () => {
		const qc = new QueryClient({
			defaultOptions: { queries: { staleTime: 30_000 } },
		});
		const source = counting("book");

		const preloaded = await fetchLoaderQuery(
			qc,
			key("a"),
			source.fn,
			"preload",
		);
		const navigated = await fetchLoaderQuery(qc, key("a"), source.fn, "enter");

		expect(source.calls).toBe(1);
		expect(navigated).toBe(preloaded);
	});

	it("concurrent preload and navigation dedupe in flight", async () => {
		const qc = new QueryClient({
			defaultOptions: { queries: { staleTime: 30_000 } },
		});
		const source = counting("book");

		const [a, b] = await Promise.all([
			fetchLoaderQuery(qc, key("a"), source.fn, "preload"),
			fetchLoaderQuery(qc, key("a"), source.fn, "enter"),
		]);
		expect(source.calls).toBe(1);
		expect(a).toBe(b);
	});

	it("cause 'stay' (router.invalidate) bypasses the cache", async () => {
		const qc = new QueryClient({
			defaultOptions: { queries: { staleTime: 30_000 } },
		});
		const source = counting("book");

		await fetchLoaderQuery(qc, key("a"), source.fn, "enter");
		const refreshed = await fetchLoaderQuery(qc, key("a"), source.fn, "stay");

		expect(source.calls).toBe(2);
		expect(refreshed).toBe("book-2");
	});

	it("distinct books cache independently", async () => {
		const qc = new QueryClient({
			defaultOptions: { queries: { staleTime: 30_000 } },
		});
		const source = counting("book");

		await fetchLoaderQuery(qc, key("a"), source.fn, "enter");
		await fetchLoaderQuery(qc, key("b"), source.fn, "enter");
		expect(source.calls).toBe(2);
	});

	it("failures reject without being cached", async () => {
		const qc = new QueryClient({
			defaultOptions: { queries: { staleTime: 30_000 } },
		});
		let calls = 0;
		const failing = async () => {
			calls += 1;
			throw new Error("404");
		};
		await expect(
			fetchLoaderQuery(qc, key("a"), failing, "enter"),
		).rejects.toThrow("404");
		// retry: false → exactly one attempt
		expect(calls).toBe(1);

		const recovered = await fetchLoaderQuery(
			qc,
			key("a"),
			async () => "ok",
			"enter",
		);
		expect(recovered).toBe("ok");
	});
});
