import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
	patchQueries,
	withMembership,
	withoutBook,
	withoutRecommendation,
	withShelfStatus,
} from "./optimistic";

const key = (path: string[], input: unknown) => [
	path,
	{ type: "query", input },
];

const read = (client: QueryClient, queryKey: unknown[]): unknown =>
	client.getQueryData(queryKey);

describe("patchQueries", () => {
	test("every matching answer changes at once and the undo puts them back", async () => {
		const client = new QueryClient();
		const all = key(["readingProgress", "listInProgress"], { limit: 20 });
		const few = key(["readingProgress", "listInProgress"], { limit: 3 });
		const other = key(["books", "listRecent"], {});
		const rows = [{ bookUuid: "a" }, { bookUuid: "b" }];
		client.setQueryData(all, rows);
		client.setQueryData(few, rows);
		client.setQueryData(other, rows);

		const undo = await patchQueries<{ bookUuid: string }[]>(
			client,
			{ queryKey: [["readingProgress", "listInProgress"]] },
			(list) => withoutBook(list, "a"),
		);
		expect(read(client, all)).toEqual([{ bookUuid: "b" }]);
		expect(read(client, few)).toEqual([{ bookUuid: "b" }]);
		expect(read(client, other)).toEqual(rows);

		undo();
		expect(read(client, all)).toEqual(rows);
		expect(read(client, few)).toEqual(rows);
	});

	test("a title on no shelf yet (a null answer) gets its status too", async () => {
		const client = new QueryClient();
		const shelf = key(["bookShelf", "get"], { bookUuid: "a" });
		client.setQueryData(shelf, null);
		const undo = await patchQueries<{ status: string } | null>(
			client,
			{ queryKey: shelf, exact: true },
			(entry) => withShelfStatus(entry, "reading"),
		);
		expect(read(client, shelf)).toEqual({ status: "reading" });
		undo();
		expect(read(client, shelf)).toBeNull();
	});

	test("an answer still in flight cannot land over the change", async () => {
		const client = new QueryClient();
		const shelf = key(["bookShelf", "get"], { bookUuid: "a" });
		client.setQueryData(shelf, { status: "want_to_read" });
		void client
			.fetchQuery({
				queryKey: shelf,
				queryFn: () =>
					new Promise((resolve) =>
						setTimeout(() => resolve({ status: "want_to_read" }), 20),
					),
			})
			.catch(() => undefined);
		await patchQueries<{ status: string } | null>(
			client,
			{ queryKey: shelf, exact: true },
			(entry) => withShelfStatus(entry, "completed"),
		);
		await new Promise((resolve) => setTimeout(resolve, 40));
		expect(read(client, shelf)).toEqual({ status: "completed" });
	});
});

test("taking a title off its shelf leaves no entry", () => {
	expect(withShelfStatus({ status: "reading", id: 1 }, null)).toBeNull();
	expect(withShelfStatus({ status: "reading", id: 1 }, "completed")).toEqual({
		status: "completed",
		id: 1,
	});
});

test("a checked collection counts the title, an unchecked one stops", () => {
	const list = [
		{ id: "a", inCollection: false, bookCount: 2 },
		{ id: "b", inCollection: true, bookCount: 1 },
		{ id: "c", inCollection: false, bookCount: null },
	];
	expect(withMembership(list, "a", true)[0]).toEqual({
		id: "a",
		inCollection: true,
		bookCount: 3,
	});
	expect(withMembership(list, "b", false)[1]).toEqual({
		id: "b",
		inCollection: false,
		bookCount: 0,
	});
	expect(withMembership(list, "c", true)[2].bookCount).toBeNull();
	// A repeated tap on a state already shown doesn't count twice.
	expect(withMembership(list, "b", true)[1].bookCount).toBe(1);
});

test("not interested takes the title out of every mix and flat list", () => {
	const item = (uuid: string) => ({ book: { uuid } });
	expect(
		withoutRecommendation(
			{ enabled: true, mixes: [{ items: [item("a"), item("b")] }] },
			"a",
		).mixes[0].items,
	).toEqual([item("b")]);
	expect(
		withoutRecommendation({ enabled: true, items: [item("a"), item("b")] }, "b")
			.items,
	).toEqual([item("a")]);
});
