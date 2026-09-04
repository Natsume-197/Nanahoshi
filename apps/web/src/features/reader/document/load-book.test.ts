import "@/test-utils/setup-dom";

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ReaderBookFacts } from "./reader-book-cache";
import type { ReaderBookData } from "./types";

const cache = await import("./reader-book-cache");
const memory = await import("./reader-book-memory-cache");
const getFile = mock(async (): Promise<Blob | undefined> => undefined);
const getFacts = mock(
	async (): Promise<ReaderBookFacts | undefined> => undefined,
);
const putFile = mock(async () => {});
const putFacts = mock(async () => {});
const getReaderUrl = mock(async () => ({
	filename: "book.epub",
	url: "https://reader.test/book",
}));
const download = mock(async () => new Response("ebook bytes"));
const data: ReaderBookData = {
	uuid: "book",
	sourceFormat: "epub",
	title: "Book",
	language: "en",
	elementHtml: "<div id=chapter>Text</div>",
	styleSheet: "",
	blobs: {},
	characters: 4,
	sections: [{ reference: "chapter", charactersWeight: 4 }],
	sectionCharacterCounts: [4],
};
const parse = mock(
	async (
		_uuid: string,
		_blob: Blob,
		_filename: string,
		_title: string,
		_document: Document,
		facts?: ReaderBookFacts,
	): Promise<ReaderBookData> => cache.applyReaderBookFacts(data, facts) ?? data,
);

mock.module("./reader-book-cache", () => ({
	...cache,
	getCachedReaderBookFile: getFile,
	getReaderBookFacts: getFacts,
	putCachedReaderBookFile: putFile,
	putReaderBookFacts: putFacts,
}));
mock.module("./load-ebook", () => ({ loadEbook: parse }));
mock.module("@/utils/orpc", () => ({ client: { files: { getReaderUrl } } }));
const { loadBookForReader } = await import("./load-book");
const options = {
	uuid: "book",
	serverId: "server",
	fileHash: "hash",
	fileName: "book.epub",
	bookTitle: "Book",
};
const originalFetch = globalThis.fetch;
afterAll(() => {
	globalThis.fetch = originalFetch;
});

beforeEach(async () => {
	await cache.clearReaderBookCache();
	for (const fn of [
		getFile,
		getFacts,
		putFile,
		putFacts,
		getReaderUrl,
		download,
		parse,
	])
		fn.mockClear();
	globalThis.fetch = download as unknown as typeof fetch;
});

describe("reader startup critical path", () => {
	test("memory hit skips storage, network and parsing but still validates format", async () => {
		memory.putReaderBookMemoryCache(options, data);
		expect((await loadBookForReader(options)).data.characters).toBe(4);
		expect(getFile).not.toHaveBeenCalled();
		expect(getFacts).not.toHaveBeenCalled();
		expect(getReaderUrl).not.toHaveBeenCalled();
		expect(download).not.toHaveBeenCalled();
		expect(parse).not.toHaveBeenCalled();
		await expect(
			loadBookForReader({ ...options, sourceFormat: "mobi" }),
		).rejects.toThrow("Unsupported");
		await expect(
			loadBookForReader({ ...options, fileName: "book.exe" }),
		).rejects.toThrow("Unsupported");
	});

	test("starts both persistent reads without waiting for the file read", async () => {
		const file = Promise.withResolvers<Blob | undefined>();
		getFile.mockImplementationOnce(() => file.promise);
		const opening = loadBookForReader(options);
		expect(getFile).toHaveBeenCalledTimes(1);
		expect(getFacts).toHaveBeenCalledTimes(1);
		file.resolve(new Blob(["ebook bytes"]));
		await opening;
	});

	test("returns the book while both cache writes are still pending", async () => {
		const writes = Promise.withResolvers<void>();
		putFile.mockImplementationOnce(() => writes.promise);
		putFacts.mockImplementationOnce(() => writes.promise);
		try {
			const loaded = await loadBookForReader(options);
			expect(loaded.data.characters).toBe(4);
			expect(putFile).toHaveBeenCalledTimes(1);
			expect(putFacts).toHaveBeenCalledTimes(1);
			expect(memory.getReaderBookMemoryCache(options)?.characters).toBe(4);
		} finally {
			writes.resolve();
		}
	});

	test("reuses valid facts without rewriting them", async () => {
		getFile.mockResolvedValueOnce(new Blob(["ebook bytes"]));
		getFacts.mockResolvedValueOnce(cache.readerBookFactsFromData(data));
		expect(
			(await loadBookForReader(options)).data.sectionCharacterCounts,
		).toEqual([4]);
		expect(putFacts).not.toHaveBeenCalled();
	});

	test("does not repopulate memory or facts when sign-out happens during parsing", async () => {
		const started = Promise.withResolvers<void>();
		const parsed = Promise.withResolvers<ReaderBookData>();
		parse.mockImplementationOnce(() => {
			started.resolve();
			return parsed.promise;
		});
		const opening = loadBookForReader(options);
		await started.promise;
		await cache.clearReaderBookCache();
		parsed.resolve(data);
		await opening;
		expect(putFacts).not.toHaveBeenCalled();
		expect(memory.getReaderBookMemoryCache(options)).toBeUndefined();
	});
});
