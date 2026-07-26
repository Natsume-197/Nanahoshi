import { describe, expect, test } from "bun:test";
import { CATALOG_IDENTITY_REASONS as R } from "../catalogIdentity/types";
import { isProvisionalMatch } from "./provisional-match";

describe("isProvisionalMatch", () => {
	test("an exact title + author match stands on its own", () => {
		expect(
			isProvisionalMatch([
				R.GROUP_MEMBER_CONFIRMED,
				R.TITLE_MATCH,
				R.TITLE_EQUIVALENT,
				R.AUTHOR_MATCH,
			]),
		).toBe(false);
	});

	test("a title matched only through the fuzzy fallback needs review", () => {
		expect(
			isProvisionalMatch([
				R.GROUP_MEMBER_CONFIRMED,
				R.TITLE_MATCH,
				R.AUTHOR_MATCH,
			]),
		).toBe(true);
	});

	test("an equally confirmable rival needs review when the winner is fuzzy", () => {
		expect(
			isProvisionalMatch([R.TITLE_MATCH, R.AUTHOR_MATCH], { ambiguous: true }),
		).toBe(true);
	});

	// Sibling volumes of a plainly numbered series ("SERIES 2" vs "SERIES 2年生編2")
	// all look confirmable at discovery, so a rival must not outrank the winner's
	// own exact evidence — otherwise every such series lands in the queue.
	test("a rival does not override an equivalent title with a matching author", () => {
		expect(
			isProvisionalMatch([R.TITLE_MATCH, R.TITLE_EQUIVALENT, R.AUTHOR_MATCH], {
				ambiguous: true,
			}),
		).toBe(false);
	});

	test("an equivalent title with no author corroboration still needs review", () => {
		expect(
			isProvisionalMatch([R.TITLE_MATCH, R.TITLE_EQUIVALENT], {
				ambiguous: true,
			}),
		).toBe(true);
	});

	test("a hard identifier outranks both review triggers", () => {
		expect(
			isProvisionalMatch([R.TITLE_MATCH, R.AUTHOR_MATCH, R.IDENTIFIER_MATCH], {
				ambiguous: true,
			}),
		).toBe(false);
		expect(isProvisionalMatch([R.TITLE_MATCH, R.EMBEDDED_UID_MATCH])).toBe(
			false,
		);
		expect(isProvisionalMatch([R.AUDIO_ASIN_MATCH])).toBe(false);
	});

	test("no reasons at all is not treated as weak (no match to review)", () => {
		expect(isProvisionalMatch([])).toBe(false);
	});
});
