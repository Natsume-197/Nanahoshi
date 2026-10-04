import { expect, test } from "bun:test";
import { routeForWebHref } from "./web-routes";

test("book, audiobook and reader links open their phone screens", () => {
	expect(routeForWebHref("/dashboard/books/b1")).toEqual({
		pathname: "/book/[uuid]",
		params: { uuid: "b1" },
	});
	expect(routeForWebHref("/dashboard/audiobooks/a1")).toEqual({
		pathname: "/audiobook/[uuid]",
		params: { uuid: "a1" },
	});
	expect(routeForWebHref("/reader/b1")).toEqual({
		pathname: "/reader/[uuid]",
		params: { uuid: "b1" },
	});
});

test("the stats link keeps the reading or listening view", () => {
	expect(routeForWebHref("/dashboard/stats?view=reading")).toEqual({
		pathname: "/stats",
		params: { view: "reading" },
	});
	expect(routeForWebHref("/dashboard/stats?view=bogus")).toEqual({
		pathname: "/stats",
		params: {},
	});
});

test("the catalog link opens the catalog", () => {
	expect(routeForWebHref("/dashboard/books")).toBe("/catalog");
});

test("a page the app does not have is not opened", () => {
	expect(routeForWebHref("/dashboard/settings/profile")).toBeNull();
	expect(routeForWebHref("https://elsewhere.example/x")).toBeNull();
});
