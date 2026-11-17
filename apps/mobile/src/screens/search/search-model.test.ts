import { describe, expect, test } from "bun:test";
import { emptyListState, keepResultsSince, pagesFor } from "./search-model";

const state = (over: Partial<Parameters<typeof emptyListState>[0]>) =>
	emptyListState({
		isError: false,
		offline: false,
		isPending: false,
		isPlaceholderData: false,
		...over,
	});

describe("emptyListState", () => {
	test("only a real answer says nothing was found", () => {
		expect(state({})).toBe("empty");
	});

	test("an empty answer kept from the previous text reads as loading", () => {
		expect(state({ isPlaceholderData: true })).toBe("loading");
		expect(state({ isPending: true })).toBe("loading");
	});

	test("errors and offline win over loading", () => {
		expect(state({ isError: true, isPlaceholderData: true })).toBe("error");
		expect(state({ offline: true, isPending: true })).toBe("offline");
	});
});

test("the merged list drops the previous text's books under new top hits", () => {
	const old = { data: "old pages", isPlaceholderData: true };
	expect(pagesFor(old, true)).toBe("old pages");
	expect(pagesFor(old, false)).toBeUndefined();
	expect(pagesFor({ data: "new", isPlaceholderData: false }, false)).toBe(
		"new",
	);
});

test("results stay up while typing, not across an emptied field", () => {
	const keep = keepResultsSince(1000);
	expect(keep("nar", { state: { dataUpdatedAt: 1500 } })).toBe("nar");
	expect(keep("naruto", { state: { dataUpdatedAt: 500 } })).toBeUndefined();
	expect(keep("x", undefined)).toBeUndefined();
});
