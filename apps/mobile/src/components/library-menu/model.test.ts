import { expect, test } from "bun:test";
import { libraryActions } from "./model";

const allow =
	(...granted: string[]) =>
	(_resource: string, action: string) =>
		granted.includes(action);

test("members without library permissions get no menu at all", () => {
	expect(libraryActions({ mediaType: "book" }, allow())).toEqual([]);
});

test("admins upload, scan from a page of its own, and delete apart", () => {
	expect(
		libraryActions({ mediaType: "book" }, allow("upload", "scan", "delete")),
	).toEqual([
		[
			"upload",
			{ group: "scan", actions: ["scanNow", "fullScan", "reprocess", "tasks"] },
		],
		["delete"],
	]);
});

test("audiobook libraries never offer uploads", () => {
	expect(
		libraryActions({ mediaType: "audiobook" }, allow("upload", "delete")),
	).toEqual([["delete"]]);
});
