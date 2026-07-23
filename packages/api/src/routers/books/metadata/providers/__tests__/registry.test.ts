import { describe, expect, test } from "bun:test";
import { BookProviderEnum } from "../../book.metadata.model";
import {
	BOOK_PROVIDER_IDS,
	BOOK_PROVIDER_MANIFEST,
	bookProviderTag,
	isBookProviderName,
} from "../provider.manifest";
import { BOOK_PROVIDERS } from "../registry";

describe("book provider manifest/registry", () => {
	// Golden: array order IS the default enrichment chain priority. Reordering
	// this changes which provider wins each field on every enrichment run.
	test("default chain order is stable", () => {
		expect(BOOK_PROVIDER_IDS).toEqual([
			"ranobedb",
			"amazon",
			"googlebooks",
			"openlibrary",
			"goodreads",
			"hardcover",
			"comicvine",
		]);
	});

	test("every declared provider has a bound implementation and a usable manifest", () => {
		for (const id of BOOK_PROVIDER_IDS) {
			expect(BOOK_PROVIDERS[id]).toBeDefined();
			expect(typeof BOOK_PROVIDERS[id].getMetadata).toBe("function");
			expect(typeof BOOK_PROVIDERS[id].search).toBe("function");
			expect(typeof BOOK_PROVIDERS[id].getById).toBe("function");
			expect(BOOK_PROVIDER_MANIFEST[id].label.length).toBeGreaterThan(0);
			expect(BOOK_PROVIDER_MANIFEST[id].fields.length).toBeGreaterThan(0);
		}
	});

	// Golden: capability lists drive gap detection (shouldRun/needsEnrichment).
	// Guards the migration of PROVIDER_FIELDS into the manifest.
	test("provider field capabilities are stable", () => {
		const fields = Object.fromEntries(
			BOOK_PROVIDER_IDS.map((id) => [id, BOOK_PROVIDER_MANIFEST[id].fields]),
		);
		expect(fields).toEqual({
			ranobedb: [
				"titleRomaji",
				"description",
				"publishedDate",
				"pageCount",
				"isbn13",
				"asin",
				"authors",
				"publisher",
				"series",
				"genres",
				"tags",
			],
			amazon: [
				"description",
				"publishedDate",
				"pageCount",
				"asin",
				"cover",
				"authors",
				"publisher",
				"series",
				"genres",
				"rating",
				"ratingCount",
			],
			googlebooks: [
				"subtitle",
				"description",
				"publishedDate",
				"languageCode",
				"pageCount",
				"isbn10",
				"isbn13",
				"cover",
				"authors",
				"publisher",
				"series",
				"genres",
			],
			openlibrary: [
				"description",
				"publishedDate",
				"languageCode",
				"pageCount",
				"isbn10",
				"isbn13",
				"cover",
				"authors",
				"publisher",
				"genres",
			],
			goodreads: [
				"description",
				"publishedDate",
				"languageCode",
				"pageCount",
				"isbn10",
				"isbn13",
				"cover",
				"authors",
				"publisher",
				"series",
				"genres",
			],
			hardcover: [
				"subtitle",
				"description",
				"publishedDate",
				"languageCode",
				"pageCount",
				"isbn10",
				"isbn13",
				"cover",
				"authors",
				"publisher",
				"series",
				"genres",
				"tags",
			],
			comicvine: [
				"description",
				"publishedDate",
				"cover",
				"authors",
				"publisher",
				"series",
			],
		});
	});

	// Tags are persisted on author links (book_author.provider); values must
	// stay byte-identical to what existing rows contain.
	test("provider tags match the persisted attribution values", () => {
		expect(BOOK_PROVIDER_IDS.map(bookProviderTag)).toEqual([
			"RANOBEDB",
			"AMAZON",
			"GOOGLEBOOKS",
			"OPENLIBRARY",
			"GOODREADS",
			"HARDCOVER",
			"COMICVINE",
		]);
	});

	test("zod enum derives from the manifest ids", () => {
		expect([...BookProviderEnum.options].sort()).toEqual(
			[...BOOK_PROVIDER_IDS].sort(),
		);
	});

	test("isBookProviderName guards unknown ids", () => {
		expect(isBookProviderName("ranobedb")).toBe(true);
		expect(isBookProviderName("audible")).toBe(false);
		expect(isBookProviderName("")).toBe(false);
	});
});
