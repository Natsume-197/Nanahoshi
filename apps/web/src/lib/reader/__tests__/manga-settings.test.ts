import "@/test-utils/setup-dom";
import { beforeEach, describe, expect, it } from "bun:test";
import {
	defaultMangaReaderSettings,
	loadMangaReaderSettings,
	saveMangaReaderSettings,
} from "../manga-settings";

const STORAGE_KEY = "nanahoshi-manga-reader-settings";

beforeEach(() => localStorage.clear());

describe("manga reader settings", () => {
	it("uses independent defaults without changing the text reader settings", () => {
		expect(loadMangaReaderSettings()).toEqual(defaultMangaReaderSettings);
	});

	it("persists comic layout, reading direction and progress style", () => {
		saveMangaReaderSettings({
			layout: "horizontal-strip",
			readingDirection: "rtl",
			progressStyle: "page-lines",
		});
		expect(loadMangaReaderSettings()).toEqual({
			layout: "horizontal-strip",
			readingDirection: "rtl",
			progressStyle: "page-lines",
		});
	});

	it("migrates the previous continuous and spread settings", () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				flow: "continuous",
				readingDirection: "rtl",
				pageLayout: "spread",
			}),
		);
		expect(loadMangaReaderSettings()).toEqual({
			layout: "vertical-strip",
			readingDirection: "rtl",
			progressStyle: "text",
		});
	});

	it("migrates the previous comic view mode names", () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				viewMode: "wide-strip",
				readingDirection: "ltr",
				progressStyle: "bar",
			}),
		);
		expect(loadMangaReaderSettings()).toEqual({
			layout: "horizontal-strip",
			readingDirection: "ltr",
			progressStyle: "bar",
		});
	});

	it("normalizes malformed stored values", () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				layout: "columns",
				readingDirection: "sideways",
				progressStyle: "circle",
			}),
		);
		expect(loadMangaReaderSettings()).toEqual(defaultMangaReaderSettings);
	});
});
