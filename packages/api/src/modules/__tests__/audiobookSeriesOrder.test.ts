import { expect, test } from "bun:test";
import {
	compareAudiobookSeriesEntries,
	parseProviderSeriesPosition,
	parseSeriesNumber,
} from "../audiobookSeriesOrder";

test.each([
	["6.5", 6.5],
	["０．５", 0.5],
	["0", 0],
	["６．５", 6.5],
	["6-7", null],
	["5, Part 2", null],
	["1x", null],
	["", null],
	["Infinity", null],
] as const)("whole numeric tag %s", (raw, expected) =>
	expect(parseSeriesNumber(raw)).toBe(expected),
);
test.each([
	["第６．５巻", 6.5],
	["オフシーズン : 21", 21],
	["結 : 1", null],
	["4・番外編", null],
	["9・短編集", null],
	["1-3", null],
] as const)("provider sequence %s", (raw, expected) =>
	expect(parseProviderSeriesPosition(raw)).toBe(expected),
);
const row = (
	uuid: string,
	title: string,
	position: number | null,
	sequence?: string | null,
) => ({ uuid, title, filename: title, position, sequence });
const sorted = (rows: ReturnType<typeof row>[]) =>
	rows.sort(compareAudiobookSeriesEntries).map((r) => r.uuid);
test("Youjo 1: spaces do not put the latter part first, even with numeric provider labels", () => {
	expect(
		sorted([
			row("latter", "幼女戦記 1 Deus lo vult （後編）", 1, "1"),
			row("first", "幼女戦記 1 Deus lo vult（前編）", 1, "1"),
		]),
	).toEqual(["first", "latter"]);
});
test("Overlord nested structural parts use the final audio subdivision", () => {
	expect(
		sorted([
			row("latter", "[6巻・下・後編] オーバーロード6", 6),
			row("first", "[6巻・下・前編] オーバーロード6", 6),
		]),
	).toEqual(["first", "latter"]);
});
test("Silent Witch extras stay between their anchor volume and the next volume", () => {
	expect(
		sorted([
			row("5", "[5巻] Silent Witch", 5, "5"),
			row("extra", "[4巻・番外編] Silent Witch IV after", null, "4・番外編"),
			row("4", "[4巻] Silent Witch", 4, "4"),
		]),
	).toEqual(["4", "extra", "5"]);
});
test("decimal volumes retain their numeric order", () =>
	expect(
		sorted([row("7", "Saga", 7), row("6.5", "Saga", 6.5), row("6", "Saga", 6)]),
	).toEqual(["6", "6.5", "7"]));
test("a numbered subseries is not interpreted as main volume one", () =>
	expect(
		sorted([
			row("yui", "結1", null, "結 1"),
			row("14", "Oregairu14", 14, "14"),
		]),
	).toEqual(["14", "yui"]));
test("unknown positions never use import indices and ties are stable", () =>
	expect(
		sorted([
			row("b", "[19] Story", null),
			row("a", "[19] Story", null),
			row("30", "Story", 30),
		]),
	).toEqual(["30", "a", "b"]));

test("textual numbered parts sort within their volume without synthetic decimal positions", () => {
	expect(
		sorted([
			row("6", "Saga 6", 6, "6"),
			row("p2", "Saga", null, "5, Part 2"),
			row("p1", "Saga", null, "5, Part 1"),
		]),
	).toEqual(["p1", "p2", "6"]);
});
