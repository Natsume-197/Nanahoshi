import { describe, expect, test } from "bun:test";
import { resolveModalPresentation } from "./modal";

describe("resolveModalPresentation", () => {
	test("phones get a bottom sheet by default", () => {
		expect(resolveModalPresentation({ prefersSheet: true })).toBe("sheet");
	});

	test("wider screens keep the centered dialog", () => {
		expect(resolveModalPresentation({ prefersSheet: false })).toBe("dialog");
	});

	test("bare modals own their layout, so they stay dialogs on phones", () => {
		expect(resolveModalPresentation({ prefersSheet: true, bare: true })).toBe(
			"dialog",
		);
	});

	test("a bare modal can still ask for the sheet", () => {
		expect(
			resolveModalPresentation({
				prefersSheet: true,
				bare: true,
				mobilePresentation: "sheet",
			}),
		).toBe("sheet");
		expect(
			resolveModalPresentation({
				prefersSheet: false,
				bare: true,
				mobilePresentation: "sheet",
			}),
		).toBe("dialog");
	});

	test("callers can opt out of the sheet", () => {
		expect(
			resolveModalPresentation({
				prefersSheet: true,
				mobilePresentation: "dialog",
			}),
		).toBe("dialog");
	});
});
