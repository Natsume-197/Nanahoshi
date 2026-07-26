import { describe, expect, test } from "bun:test";
import { buildEnrichInput } from "../metadata.utils";

const row = {
	title: "Great Story 1",
	authors: [{ name: "Known Author", role: "Author" }],
	contentForm: "images",
};

describe("buildEnrichInput", () => {
	// Regression: the field decides which providers are consulted at all, so
	// dropping it here silently restored the behaviour it exists to prevent —
	// every provider ran, and a page-image book matched a novel's record.
	test("carries the content form from the row into the chain", () => {
		expect(buildEnrichInput(1, "book-1", row).contentForm).toBe("images");
		expect(
			buildEnrichInput(1, "book-1", { ...row, contentForm: "text" })
				.contentForm,
		).toBe("text");
	});

	test("leaves an unrecorded form undefined rather than guessing", () => {
		expect(buildEnrichInput(1, "book-1", {}).contentForm).toBeUndefined();
		expect(
			buildEnrichInput(1, "book-1", { contentForm: null }).contentForm,
		).toBeUndefined();
	});
});
