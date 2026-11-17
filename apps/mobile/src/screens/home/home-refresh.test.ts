import { expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { isHomeQuery } from "./home-refresh";

const key = (path: string[], input: unknown = {}) => [
	path,
	{ type: "query", input },
];

test("a pull refetches the drawn rails, fresh or not, and nothing else", async () => {
	const client = new QueryClient();
	const calls: string[] = [];
	const watch = (path: string[], options: { enabled?: boolean } = {}) => {
		const observer = new QueryObserver(client, {
			queryKey: key(path),
			queryFn: () => {
				calls.push(path.join("."));
				return [];
			},
			staleTime: Number.POSITIVE_INFINITY,
			...options,
		});
		return observer.subscribe(() => undefined);
	};
	watch(["books", "listRandom"]);
	watch(["recommendations", "forUser"]);
	watch(["books", "getBookWithMetadata"]);
	// A format the server lacks: its section's query is off.
	watch(["audiobooks", "listRecent"], { enabled: false });
	await new Promise((resolve) => setTimeout(resolve, 0));
	calls.length = 0;

	await client.refetchQueries({ predicate: isHomeQuery, type: "active" });
	expect(calls.sort()).toEqual(["books.listRandom", "recommendations.forUser"]);
});

test("hand-keyed queries are never Home's", () => {
	expect(isHomeQuery({ queryKey: ["books", "search", "x"] })).toBe(false);
});
