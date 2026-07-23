import { describe, expect, test } from "bun:test";
import { AudiobookProviderEnum } from "../../../audiobook.model";
import {
	AUDIOBOOK_PROVIDER_IDS,
	AUDIOBOOK_PROVIDER_MANIFEST,
	isAudiobookProviderName,
} from "../provider.manifest";
import { AUDIOBOOK_PROVIDERS } from "../registry";

describe("audiobook provider manifest/registry", () => {
	// Golden: array order IS the default enrichment chain priority.
	test("default chain order is stable", () => {
		expect(AUDIOBOOK_PROVIDER_IDS).toEqual(["audible", "itunes"]);
	});

	test("every declared provider has a bound implementation and a usable manifest", () => {
		for (const id of AUDIOBOOK_PROVIDER_IDS) {
			expect(AUDIOBOOK_PROVIDERS[id]).toBeDefined();
			expect(AUDIOBOOK_PROVIDERS[id].id).toBe(id);
			expect(typeof AUDIOBOOK_PROVIDERS[id].search).toBe("function");
			expect(typeof AUDIOBOOK_PROVIDERS[id].getById).toBe("function");
			expect(AUDIOBOOK_PROVIDER_MANIFEST[id].label.length).toBeGreaterThan(0);
			expect(AUDIOBOOK_PROVIDER_MANIFEST[id].fields.length).toBeGreaterThan(0);
		}
	});

	// Golden: capability lists drive shouldRun gap detection.
	test("provider field capabilities are stable", () => {
		expect(AUDIOBOOK_PROVIDER_MANIFEST.audible.fields).toEqual([
			"title",
			"subtitle",
			"description",
			"asin",
			"isbn",
			"languageCode",
			"publishedDate",
			"duration",
			"abridged",
			"cover",
			"authors",
			"narrators",
			"publisher",
			"series",
			"genres",
			"tags",
			"audibleRating",
		]);
		expect(AUDIOBOOK_PROVIDER_MANIFEST.itunes.fields).toEqual([
			"title",
			"description",
			"publishedDate",
			"genres",
			"cover",
			"authors",
		]);
	});

	test("zod enum derives from the manifest ids", () => {
		expect([...AudiobookProviderEnum.options].sort()).toEqual(
			[...AUDIOBOOK_PROVIDER_IDS].sort(),
		);
	});

	test("isAudiobookProviderName guards unknown ids", () => {
		expect(isAudiobookProviderName("audible")).toBe(true);
		expect(isAudiobookProviderName("ranobedb")).toBe(false);
	});
});
