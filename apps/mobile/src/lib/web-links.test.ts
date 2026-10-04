import { expect, test } from "bun:test";
import { routeForWebHref } from "@/reader/web-routes";
import { titleWebUrl } from "./web-links";

test("a shared title link opens the same title back in the app", () => {
	const book = titleWebUrl("https://books.example", "book", "b1");
	expect(book).toBe("https://books.example/dashboard/books/b1");
	expect(routeForWebHref(book)).toEqual({
		pathname: "/book/[uuid]",
		params: { uuid: "b1" },
	});
	expect(
		routeForWebHref(titleWebUrl("http://192.168.1.7:3000/", "audiobook", "a1")),
	).toEqual({ pathname: "/audiobook/[uuid]", params: { uuid: "a1" } });
});
