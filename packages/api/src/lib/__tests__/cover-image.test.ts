import { describe, expect, test } from "bun:test";
import { COVER_STORE_MAX_DIM, upgradeAmazonImageUrl } from "../cover-image";

describe("upgradeAmazonImageUrl", () => {
	test("upgrades the 500px rendition Audnexus hands us", () => {
		expect(
			upgradeAmazonImageUrl(
				"https://m.media-amazon.com/images/I/51abc._SL500_.jpg",
			),
		).toBe(
			`https://m.media-amazon.com/images/I/51abc._SL${COVER_STORE_MAX_DIM}_.jpg`,
		);
	});

	test.each([
		"SX",
		"SY",
		"SS",
		"UX",
		"UY",
		"AC",
	])("upgrades the %s rendition modifier too", (modifier) => {
		const out = upgradeAmazonImageUrl(
			`https://m.media-amazon.com/images/I/51abc._${modifier}300_.jpg`,
		);

		expect(out).toContain(`._SL${COVER_STORE_MAX_DIM}_.`);
		expect(out).not.toContain("300");
	});

	test("handles comma-separated crop modifiers", () => {
		expect(
			upgradeAmazonImageUrl(
				"https://m.media-amazon.com/images/I/51abc._CR0,0,300,300_.jpg",
			),
		).toBe(
			`https://m.media-amazon.com/images/I/51abc._SL${COVER_STORE_MAX_DIM}_.jpg`,
		);
	});

	test("leaves an unmodified url alone — it is already full size", () => {
		const url = "https://m.media-amazon.com/images/I/51abc.jpg";

		expect(upgradeAmazonImageUrl(url)).toBe(url);
	});

	test("never shrinks a rendition that is already larger", () => {
		// Rewriting this down to our own ceiling would throw away pixels the
		// provider was willing to hand over.
		const url = "https://m.media-amazon.com/images/I/51abc._SL3000_.jpg";

		expect(upgradeAmazonImageUrl(url)).toBe(url);
	});

	test("requests at least what the largest layout slot needs", () => {
		// detail preset tops out at a 1200px bucket; stored art must clear it.
		expect(COVER_STORE_MAX_DIM).toBeGreaterThanOrEqual(1200);
	});
});
