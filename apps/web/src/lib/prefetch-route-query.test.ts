import { expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { prefetchRouteQuery } from "./prefetch-route-query";

test("a route preload survives transient observer removal and is reused on mount", async () => {
	const client = new QueryClient({
		defaultOptions: { queries: { staleTime: 30_000, retry: false } },
	});
	let requests = 0;
	let aborts = 0;
	const finish: (() => void)[] = [];
	const options = {
		queryKey: ["detail", "book"],
		queryFn: ({ signal }: { signal: AbortSignal }) => {
			requests++;
			signal.addEventListener("abort", () => aborts++);
			return new Promise<string>((resolve) =>
				finish.push(() => resolve("book")),
			);
		},
	};
	const preload = prefetchRouteQuery(client, options);
	const first = new QueryObserver(client, options);
	const remove = first.subscribe(() => {});
	remove();
	const second = new QueryObserver(client, options);
	const unsubscribe = second.subscribe(() => {});
	for (const resolve of finish) resolve();
	await preload;
	await client.fetchQuery(options);
	expect(requests).toBe(1);
	expect(aborts).toBe(0);
	expect(second.getCurrentResult().data).toBe("book");
	const invalidation = client.invalidateQueries({ queryKey: options.queryKey });
	finish.at(-1)?.();
	await invalidation;
	expect(requests).toBe(2);
	unsubscribe();
	client.clear();
});

test("an abandoned preload cannot repopulate a cleared session cache", async () => {
	const client = new QueryClient();
	let complete!: (data: string) => void;
	const queryKey = ["detail", "book"];
	const preload = prefetchRouteQuery(client, {
		queryKey,
		queryFn: () =>
			new Promise<string>((resolve) => {
				complete = resolve;
			}),
	});
	client.clear();
	client.setQueryData(queryKey, "new session");
	complete("old session");
	await preload;
	expect(client.getQueryData(queryKey)).toBe("new session");
	client.clear();
});
