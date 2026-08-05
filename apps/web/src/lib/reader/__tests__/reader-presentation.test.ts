import "@/test-utils/setup-dom";
import { beforeEach, describe, expect, it } from "bun:test";
import {
	loadReaderPresentationPreference,
	resolveReaderPresentation,
	saveReaderPresentationPreference,
	updateReaderPresentationPreference,
} from "../reader-presentation";
import type { ReaderBookData } from "../types";

const book = (patch: Partial<ReaderBookData> = {}): ReaderBookData => ({
	uuid: "book-1",
	title: "Book",
	language: "ja",
	elementHtml: "",
	styleSheet: "",
	blobs: {},
	characters: 1,
	sections: [],
	storedAt: 0,
	contentForm: "text",
	...patch,
});

const resolve = (
	publication = book(),
	preference = { readAs: "auto" } as const,
) =>
	resolveReaderPresentation({
		book: publication,
		preference,
		defaultTextLayout: "paginated",
		comicLayout: "single-page",
	});

beforeEach(() => localStorage.clear());

describe("reader presentation", () => {
	it("provides a stable text fallback while the publication is loading", () => {
		expect(
			resolveReaderPresentation({
				book: null,
				preference: { readAs: "auto" },
				defaultTextLayout: "scroll",
				comicLayout: "single-page",
			}),
		).toMatchObject({
			readAs: "auto",
			resolvedAs: "text",
			engine: "text-scroll",
			supportsComic: false,
		});
	});

	it("resolves text independently from its layout", () => {
		expect(resolve()).toMatchObject({
			readAs: "auto",
			resolvedAs: "text",
			textLayout: "paginated",
			engine: "text-paginated",
		});
	});

	it("automatically presents an image EPUB as a comic", () => {
		expect(
			resolve(book({ sourceFormat: "epub", contentForm: "images" })),
		).toMatchObject({
			resolvedAs: "comic",
			engine: "comic",
			supportsComic: true,
		});
	});

	it("lets text override the recommendation without mixing in engine names", () => {
		const imageEpub = book({ sourceFormat: "epub", contentForm: "images" });
		expect(
			resolveReaderPresentation({
				book: imageEpub,
				preference: { readAs: "text", textLayout: "scroll" },
				defaultTextLayout: "paginated",
				comicLayout: "two-page-spread",
			}),
		).toMatchObject({
			readAs: "text",
			resolvedAs: "text",
			textLayout: "scroll",
			engine: "text-scroll",
		});
	});

	it("falls back safely when comic presentation is unavailable", () => {
		expect(resolve(book(), { readAs: "comic" })).toMatchObject({
			readAs: "auto",
			resolvedAs: "text",
		});
	});

	it("updates Read As and text layout through one interface", () => {
		const current = resolve();
		expect(
			updateReaderPresentationPreference(current, {
				type: "read-as",
				value: "text",
			}),
		).toEqual({ readAs: "text", textLayout: "paginated" });
		expect(
			updateReaderPresentationPreference(current, {
				type: "text-layout",
				value: "scroll",
			}),
		).toEqual({ readAs: "text", textLayout: "scroll" });
	});
});

describe("reader presentation preference storage", () => {
	it("persists explicit choices per book", () => {
		saveReaderPresentationPreference("book-1", {
			readAs: "text",
			textLayout: "paginated",
		});
		saveReaderPresentationPreference("book-2", { readAs: "comic" });
		expect(loadReaderPresentationPreference("book-1")).toEqual({
			readAs: "text",
			textLayout: "paginated",
		});
		expect(loadReaderPresentationPreference("book-2")).toEqual({
			readAs: "comic",
		});
	});

	it("migrates legacy technical modes", () => {
		localStorage.setItem(
			"nanahoshi-reader-mode-preferences",
			JSON.stringify({
				"book-1": "continuous",
				"book-2": "paginated",
				"book-3": "visual",
			}),
		);
		expect(loadReaderPresentationPreference("book-1")).toEqual({
			readAs: "text",
			textLayout: "scroll",
		});
		expect(loadReaderPresentationPreference("book-2")).toEqual({
			readAs: "text",
			textLayout: "paginated",
		});
		expect(loadReaderPresentationPreference("book-3")).toEqual({
			readAs: "comic",
		});
	});

	it("removes an override when returning to automatic", () => {
		saveReaderPresentationPreference("book-1", { readAs: "comic" });
		saveReaderPresentationPreference("book-1", { readAs: "auto" });
		expect(loadReaderPresentationPreference("book-1")).toEqual({
			readAs: "auto",
		});
	});
});
