import { describe, expect, test } from "bun:test";
import { parseVolumeIntent } from "../volume-intent";

describe("parseVolumeIntent", () => {
	test("bare trailing number", () => {
		expect(parseVolumeIntent("konosuba 3")).toEqual({
			text: "konosuba",
			volume: 3,
		});
	});

	test("multi-word query keeps the full text", () => {
		expect(parseVolumeIntent("no game no life 5")).toEqual({
			text: "no game no life",
			volume: 5,
		});
	});

	test("volume keywords", () => {
		expect(parseVolumeIntent("konosuba vol. 3").volume).toBe(3);
		expect(parseVolumeIntent("konosuba volume 12").volume).toBe(12);
		expect(parseVolumeIntent("konosuba Tomo 2").volume).toBe(2);
		expect(parseVolumeIntent("konosuba vol 3").text).toBe("konosuba");
	});

	test("decimal volumes (side stories)", () => {
		expect(parseVolumeIntent("overlord 2.5")).toEqual({
			text: "overlord",
			volume: 2.5,
		});
	});

	test("japanese 巻 counter with and without 第", () => {
		expect(parseVolumeIntent("この素晴らしい世界に祝福を! 第3巻")).toEqual({
			text: "この素晴らしい世界に祝福を!",
			volume: 3,
		});
		expect(parseVolumeIntent("よふかしのうた3巻")).toEqual({
			text: "よふかしのうた",
			volume: 3,
		});
	});

	test("full-width digits normalize", () => {
		expect(parseVolumeIntent("ソードアート・オンライン ２")).toEqual({
			text: "ソードアート・オンライン",
			volume: 2,
		});
	});

	test("a bare number is a title, not volume intent", () => {
		expect(parseVolumeIntent("86")).toEqual({ text: "86", volume: null });
		expect(parseVolumeIntent("1984")).toEqual({ text: "1984", volume: null });
		expect(parseVolumeIntent("第3巻")).toEqual({ text: "第3巻", volume: null });
	});

	test("number glued to latin text is not stripped", () => {
		expect(parseVolumeIntent("konosuba3")).toEqual({
			text: "konosuba3",
			volume: null,
		});
	});

	test("no trailing number leaves the query untouched", () => {
		expect(parseVolumeIntent("konosuba")).toEqual({
			text: "konosuba",
			volume: null,
		});
	});

	test("implausibly large numbers are ignored", () => {
		expect(parseVolumeIntent("dune 2021").volume).toBe(null);
	});
});
