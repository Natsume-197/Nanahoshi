import "@/test-utils/setup-dom";

import { describe, expect, mock, spyOn, test } from "bun:test";
import type { ReaderBookData } from "@/features/reader/document/types";
import { recountBookData } from "./processing/recount-book-data";
import {
	applyReaderBookFacts,
	clearReaderBookCache,
	getReaderBookCacheGeneration,
	putCachedReaderBookFile,
	putReaderBookFacts,
	readerBookFactsFromData,
} from "./reader-book-cache";

const data: ReaderBookData = {
	uuid: "book-1",
	sourceFormat: "epub",
	contentForm: "text",
	title: "Book",
	cover: null,
	language: "ja",
	elementHtml: "<div></div>",
	styleSheet: "",
	blobs: {},
	characters: 42,
	sections: [
		{ reference: "chapter-1", charactersWeight: 12, characters: 12 },
		{ reference: "chapter-2", charactersWeight: 30, characters: 30 },
	],
};

describe("reader book facts", () => {
	test("reuses exact own counts without another DOM pass, including child sections and empty covers", () => {
		const createDocument = spyOn(document.implementation, "createHTMLDocument");
		try {
			const counted = recountBookData(
				{
					...data,
					elementHtml:
						'<div id="cover"></div><div id="main"><ruby>漢字<rt>かんじ</rt></ruby><span hidden>ignored</span></div><div id="child"><img class="gaiji">x</div><div id="next"><img></div>',
					sections: [
						{ reference: "cover", charactersWeight: 1 },
						{ reference: "main", charactersWeight: 1 },
						{ reference: "child", charactersWeight: 1, parentChapter: "main" },
						{ reference: "next", charactersWeight: 1 },
					],
				},
				document,
			);
			const facts = readerBookFactsFromData(counted);
			if (!facts) throw new Error("Expected recounted facts");
			expect(facts.sectionCharacterCounts).toEqual([0, 2, 2, 1]);
			expect(facts.characters).toBe(5);
			expect(facts.sections[1]).toMatchObject({
				characters: 4,
				startCharacter: 0,
			});
			expect(facts.sections[3]).toMatchObject({
				characters: 1,
				startCharacter: 4,
			});
			const restored = applyReaderBookFacts(counted, facts);
			if (!restored) throw new Error("Expected restored facts");
			expect(readerBookFactsFromData(restored)).toEqual(facts);
			expect(createDocument).toHaveBeenCalledTimes(1);
		} finally {
			createDocument.mockRestore();
		}
	});

	test("sign-out invalidates writes waiting for IndexedDB and later writes from the same load", async () => {
		const original = globalThis.indexedDB;
		const put = mock(() => {});
		const close = mock(() => {});
		const request = {} as IDBOpenDBRequest;
		const open = mock(() => request);
		globalThis.indexedDB = {
			open,
			deleteDatabase: () => {
				const deletion = {} as IDBOpenDBRequest;
				queueMicrotask(() =>
					deletion.onsuccess?.call(deletion, new Event("success")),
				);
				return deletion;
			},
		} as unknown as IDBFactory;
		const key = { serverId: "server", uuid: "book", fileHash: "hash" };
		const facts = {
			...data,
			schemaVersion: 3 as const,
			sectionCharacterCounts: [12, 30],
		};
		try {
			const generation = getReaderBookCacheGeneration();
			const fileWrite = putCachedReaderBookFile(
				key,
				new Blob(["private"]),
				generation,
			);
			const factsWrite = putReaderBookFacts(key, facts, generation);
			const clearing = clearReaderBookCache();
			Object.assign(request, {
				result: {
					close,
					transaction: () => ({ objectStore: () => ({ put }) }),
				},
			});
			request.onsuccess?.call(request, new Event("success"));
			await Promise.all([fileWrite, factsWrite, clearing]);
			await putCachedReaderBookFile(key, new Blob(["late bytes"]), generation);
			await putReaderBookFacts(key, facts, generation);
			expect(put).not.toHaveBeenCalled();
			expect(close).toHaveBeenCalledTimes(1);
			expect(open).toHaveBeenCalledTimes(1);
		} finally {
			globalThis.indexedDB = original;
		}
	});
	test("restores facts for the same section order", () => {
		const facts = {
			...data,
			schemaVersion: 3 as const,
			sectionCharacterCounts: [12, 30],
		};
		const rebuilt = {
			...data,
			characters: 0,
			sections: data.sections.map((section) => ({
				...section,
				charactersWeight: 1,
				characters: undefined,
			})),
		};

		expect(applyReaderBookFacts(rebuilt, facts)).toMatchObject({
			characters: 42,
			sections: [
				{ reference: "chapter-1", charactersWeight: 12, characters: 12 },
				{ reference: "chapter-2", charactersWeight: 30, characters: 30 },
			],
		});
	});

	test("rejects facts when the source section order changed", () => {
		const facts = {
			...data,
			schemaVersion: 3 as const,
			sectionCharacterCounts: [12, 30],
		};
		expect(
			applyReaderBookFacts(
				{ ...data, sections: [...data.sections].reverse() },
				facts,
			),
		).toBeUndefined();
	});
});
