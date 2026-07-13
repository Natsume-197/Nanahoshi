import { describe, expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
	adjustLikedCount,
	removeBookFromLikedLists,
} from "../liked-books-cache";

// Mirrors the orpc key shape: [[...path], { type, input }].
const listKey = (input: Record<string, unknown>) => [
	["likedBooks", "listLiked"],
	{ input, type: "infinite" },
];
const countKey = (format: string) => [
	["likedBooks", "count"],
	{ input: { format }, type: "query" },
];

const item = (bookUuid: string) => ({ bookUuid, title: bookUuid });
type ListData = { pages: ReturnType<typeof item>[][]; pageParams: number[] };

describe("removeBookFromLikedLists", () => {
	it("removes the book from every cached list variant and every page", () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(listKey({ sort: "recent", format: "books" }), {
			pages: [[item("a"), item("b")], [item("c")]],
			pageParams: [0, 30],
		});
		queryClient.setQueryData(listKey({ sort: "title", format: "books" }), {
			pages: [[item("b"), item("a")]],
			pageParams: [0],
		});

		removeBookFromLikedLists(queryClient, "a");

		expect(
			queryClient.getQueryData<ListData>(
				listKey({ sort: "recent", format: "books" }),
			),
		).toEqual({ pages: [[item("b")], [item("c")]], pageParams: [0, 30] });
		expect(
			queryClient.getQueryData<ListData>(
				listKey({ sort: "title", format: "books" }),
			),
		).toEqual({ pages: [[item("b")]], pageParams: [0] });
	});

	it("leaves unrelated caches untouched", () => {
		const queryClient = new QueryClient();
		const otherKey = [["books", "listRecent"], { type: "query" }];
		queryClient.setQueryData(otherKey, [item("a")]);

		removeBookFromLikedLists(queryClient, "a");

		expect(
			queryClient.getQueryData<ListData["pages"][number]>(otherKey),
		).toEqual([item("a")]);
	});
});

describe("adjustLikedCount", () => {
	it("only adjusts the matching format", () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(countKey("books"), 5);
		queryClient.setQueryData(countKey("audiobooks"), 2);

		adjustLikedCount(queryClient, "books", -1);

		expect(queryClient.getQueryData<number>(countKey("books"))).toBe(4);
		expect(queryClient.getQueryData<number>(countKey("audiobooks"))).toBe(2);
	});

	it("clamps at zero and skips missing caches", () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(countKey("books"), 0);

		adjustLikedCount(queryClient, "books", -1);
		adjustLikedCount(queryClient, "audiobooks", 1);

		expect(queryClient.getQueryData<number>(countKey("books"))).toBe(0);
		expect(
			queryClient.getQueryData<number>(countKey("audiobooks")),
		).toBeUndefined();
	});
});
