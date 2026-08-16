import { beforeEach, describe, expect, test } from "bun:test";
import type { ReaderBookData } from "@/features/reader/document/types";
import {
	clearReaderBookMemoryCache,
	getReaderBookMemoryCache,
	putReaderBookMemoryCache,
} from "./reader-book-memory-cache";

const key = { serverId: "server", uuid: "book", fileHash: "hash-a" };
const data: ReaderBookData = {
	uuid: "book",
	title: "Book",
	cover: null,
	language: "en",
	elementHtml: "<p>Text</p>",
	styleSheet: "",
	blobs: {},
	characters: 4,
	sections: [{ reference: "chapter", charactersWeight: 4 }],
};

describe("reader book memory cache", () => {
	beforeEach(clearReaderBookMemoryCache);

	test("reuses parsed data only for the same content hash", () => {
		putReaderBookMemoryCache(key, data);

		expect(getReaderBookMemoryCache(key)).toMatchObject({ characters: 4 });
		expect(
			getReaderBookMemoryCache({ ...key, fileHash: "hash-b" }),
		).toBeUndefined();
	});

	test("returns a copy so reader-specific metadata cannot poison the cache", () => {
		putReaderBookMemoryCache(key, data);
		const cached = getReaderBookMemoryCache(key);
		if (!cached) throw new Error("expected cached data");
		cached.cover = "changed.jpg";
		cached.sections[0]!.label = "Changed";

		const fresh = getReaderBookMemoryCache(key);
		expect(fresh?.cover).toBeNull();
		expect(fresh?.sections[0]?.label).toBeUndefined();
	});
});
