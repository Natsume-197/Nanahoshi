import "@/test-utils/setup-dom";
import { afterEach, expect, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSearchHistory } from "./use-search-history";

afterEach(() => {
	cleanup();
	localStorage.clear();
});

const book = {
	type: "book" as const,
	uuid: "book-1",
	title: "Dune",
	filename: "dune.epub",
	cover: null,
	authors: [],
};

test("mixes queries and results chronologically and removes either kind", () => {
	const page = renderHook(() => useSearchHistory());
	const header = renderHook(() => useSearchHistory());

	act(() => page.result.current.addQuery("Dune saga"));
	act(() => page.result.current.addHit(book));
	act(() => page.result.current.addQuery("science fiction"));

	expect(header.result.current.history).toEqual(page.result.current.history);
	expect(
		page.result.current.history.map((entry) =>
			entry.kind === "query" ? entry.query : entry.hit.uuid,
		),
	).toEqual(["science fiction", "book-1", "Dune saga"]);

	act(() => page.result.current.remove(page.result.current.history[1]));
	expect(
		header.result.current.history.map((entry) =>
			entry.kind === "query" ? entry.query : entry.hit.uuid,
		),
	).toEqual(["science fiction", "Dune saga"]);

	act(() => page.result.current.remove(page.result.current.history[0]));
	expect(
		header.result.current.history.map((entry) =>
			entry.kind === "query" ? entry.query : entry.hit.uuid,
		),
	).toEqual(["Dune saga"]);
});

test("migrates legacy history once and keeps it deleted", () => {
	localStorage.setItem(
		"nanahoshi:recent-searches",
		JSON.stringify(["legacy query"]),
	);
	const firstVisit = renderHook(() => useSearchHistory());
	expect(firstVisit.result.current.history[0]).toMatchObject({
		kind: "query",
		query: "legacy query",
	});

	act(() =>
		firstVisit.result.current.remove(firstVisit.result.current.history[0]),
	);
	firstVisit.unmount();

	const nextVisit = renderHook(() => useSearchHistory());
	expect(nextVisit.result.current.history).toEqual([]);
});

test("replaces the query that led to a selected result", () => {
	const { result } = renderHook(() => useSearchHistory());

	act(() => result.current.addQuery("a"));
	act(() => result.current.addQuery("an older search"));
	act(() => result.current.addHit(book, "a"));

	expect(
		result.current.history.map((entry) =>
			entry.kind === "query" ? entry.query : entry.hit.uuid,
		),
	).toEqual(["book-1", "an older search"]);
});
