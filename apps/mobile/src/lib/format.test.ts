import { expect, mock, test } from "bun:test";

mock.module("expo-secure-store", () => ({
	getItem: () => null,
	setItemAsync: async () => {},
}));
mock.module("expo-localization", () => ({ getLocales: () => [] }));
const { joinNames } = await import("./format");

test("lists every author instead of collapsing the rest into +N", () => {
	expect(
		joinNames([
			{ name: "Ann Patchett" },
			{ name: " " },
			{ name: null },
			{ name: "Tom Hanks" },
			{ name: "Meryl Streep" },
		]),
	).toBe("Ann Patchett, Tom Hanks, Meryl Streep");
	expect(joinNames(null)).toBe("");
});
