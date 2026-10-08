import { describe, expect, test } from "bun:test";
import { guessStart, pendingBook, pendingChapter } from "./pending";

const chapters = [
	{ index: 0, title: "Prologue", startTime: 0, endTime: 600 },
	{ index: 1, title: "Chapter 1", startTime: 600, endTime: 1800 },
	{ index: 2, title: "Chapter 2", startTime: 1800, endTime: 3000 },
];
const card = {
	title: "Oregairu 1",
	cover: "covers/a.jpg",
	color: "#123",
	authors: ["Wataru Watari"],
};

describe("pendingBook", () => {
	test("names the book from the first source that knows it", () => {
		const pending = pendingBook("b1", [null, card]);
		expect(pending).toMatchObject({ uuid: "b1", title: "Oregairu 1" });
		expect(pending.failed).toBe(false);
	});

	test("a book nobody knows yet still gets a card", () => {
		const pending = pendingBook("b1", [null, undefined]);
		expect(pending).toMatchObject({ uuid: "b1", title: "", cover: null });
	});

	test("borrows a cover when the source with the title has none", () => {
		const pending = pendingBook("b1", [
			{ ...card, cover: null },
			{ title: "", cover: "covers/b.jpg", color: null, authors: [] },
		]);
		expect(pending.cover).toBe("covers/b.jpg");
	});
});

describe("pendingChapter", () => {
	test("opens on the chapter of the saved position", () => {
		const pending = pendingBook("b1", [{ ...card, chapters }], 2000);
		expect(pendingChapter(pending)?.title).toBe("Chapter 2");
	});

	test("unknown position or chapters: nothing to predict", () => {
		expect(pendingChapter(pendingBook("b1", [{ ...card, chapters }]))).toBe(
			null,
		);
		expect(pendingChapter(pendingBook("b1", [card], 2000))).toBe(null);
	});
});

describe("guessStart", () => {
	test("the download's own position wins", () => {
		expect(guessStart(120, { time: 900, completed: false })).toBe(120);
	});

	test("a finished book starts over", () => {
		expect(guessStart(null, { time: 2990, completed: true })).toBe(0);
	});

	test("nothing known: no guess", () => {
		expect(guessStart(null, null)).toBe(null);
	});
});
