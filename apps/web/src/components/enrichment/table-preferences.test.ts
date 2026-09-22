import { expect, test } from "bun:test";
import {
	DEFAULT_COLUMN_PINNING,
	DEFAULT_COLUMN_SIZING,
	MATCH_COLUMN_ORDER,
	readTablePreferences,
	writeTablePreferences,
} from "./table-preferences";

const preferences = {
	order: MATCH_COLUMN_ORDER,
	sizing: DEFAULT_COLUMN_SIZING,
	pinning: DEFAULT_COLUMN_PINNING,
};
const read = (value: unknown) =>
	readTablePreferences({ getItem: () => JSON.stringify(value) });

test("valid table preferences round-trip through storage", () => {
	let saved = "";
	writeTablePreferences(
		{
			setItem: (_key, value) => {
				saved = value;
			},
		},
		preferences,
	);
	expect(readTablePreferences({ getItem: () => saved })).toEqual(preferences);
});

test("rejects malformed layouts before passing them to the table", () => {
	for (const invalid of [
		null,
		{},
		{ ...preferences, order: "book" },
		{
			...preferences,
			order: ["select", "book", "book", "status", "updated", "actions"],
		},
		{ ...preferences, order: [...MATCH_COLUMN_ORDER].reverse() },
		{ ...preferences, sizing: { ...DEFAULT_COLUMN_SIZING, book: -1 } },
		{ ...preferences, pinning: { start: ["unknown"], end: [] } },
		{ ...preferences, pinning: { start: ["book"], end: ["book"] } },
	])
		expect(read(invalid)).toBeNull();
	expect(readTablePreferences({ getItem: () => "{" })).toBeNull();
});

test("unavailable storage never prevents using the table", () => {
	expect(
		readTablePreferences({
			getItem: () => {
				throw new Error("blocked");
			},
		}),
	).toBeNull();
	expect(() =>
		writeTablePreferences(
			{
				setItem: () => {
					throw new Error("quota");
				},
			},
			preferences,
		),
	).not.toThrow();
});
