import { expect, test } from "bun:test";
import { decodeActiveBook, encodeActiveBook } from "./active-book";

test("brings back the book saved for the same server", () => {
	const raw = encodeActiveBook("https://a.example", "book-1");
	expect(decodeActiveBook(raw, "https://a.example")).toBe("book-1");
});

test("ignores a book saved while connected to another server", () => {
	const raw = encodeActiveBook("https://a.example", "book-1");
	expect(decodeActiveBook(raw, "https://b.example")).toBeNull();
});

test("treats a cleared or corrupt pointer as none", () => {
	expect(decodeActiveBook("", "https://a.example")).toBeNull();
	expect(decodeActiveBook("{nope", "https://a.example")).toBeNull();
});
