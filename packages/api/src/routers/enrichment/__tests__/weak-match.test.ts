import { describe, expect, test } from "bun:test";
import { CATALOG_IDENTITY_REASONS as R } from "../../../modules/catalogIdentity/types";
import { isWeakIdentityMatch } from "../weak-match";

describe("isWeakIdentityMatch", () => {
	test("a title+author match without a hard identifier is weak (review)", () => {
		expect(
			isWeakIdentityMatch([
				R.GROUP_MEMBER_CONFIRMED,
				R.TITLE_MATCH,
				R.AUTHOR_MATCH,
			]),
		).toBe(true);
	});

	test("a hard identifier makes a match strong", () => {
		expect(
			isWeakIdentityMatch([R.TITLE_MATCH, R.AUTHOR_MATCH, R.IDENTIFIER_MATCH]),
		).toBe(false);
		expect(isWeakIdentityMatch([R.TITLE_MATCH, R.EMBEDDED_UID_MATCH])).toBe(
			false,
		);
		expect(isWeakIdentityMatch([R.AUDIO_ASIN_MATCH])).toBe(false);
	});

	test("no reasons at all is not treated as weak (no match to review)", () => {
		expect(isWeakIdentityMatch([])).toBe(false);
	});
});
