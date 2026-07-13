import { describe, expect, it, mock } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { invalidateEverywhere } from "../invalidate-everywhere";

const fetchedKey = [["readingProgress", "listInProgress"], { type: "query" }];
const seededKey = [
	["readingProgress", "getProgress"],
	{ input: { bookUuid: "a" }, type: "query" },
];
const prefix = [["readingProgress"]];

describe("invalidateEverywhere", () => {
	it("refetches unmounted queries that have a queryFn", async () => {
		const queryClient = new QueryClient();
		const queryFn = mock(() => Promise.resolve("fresh"));
		await queryClient.fetchQuery({ queryKey: fetchedKey, queryFn });

		await invalidateEverywhere(queryClient, [prefix]);

		expect(queryFn).toHaveBeenCalledTimes(2);
		expect(queryClient.getQueryData<string>(fetchedKey)).toBe("fresh");
	});

	it("skips setQueryData-seeded entries instead of erroring on Missing queryFn", async () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(seededKey, { status: "reading" });

		await invalidateEverywhere(queryClient, [prefix]);

		const state = queryClient.getQueryState(seededKey);
		expect(state?.status).toBe("success");
		expect(state?.isInvalidated).toBe(true);
	});
});
