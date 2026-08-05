import { describe, expect, test } from "bun:test";
import {
	type ContentFormDeclaration,
	type ContentFormSample,
	contentFormFromDeclaration,
	contentFormTextBudget,
	htmlBodyTextLength,
	htmlImageCount,
	resolveContentForm,
} from "../catalogContentForm";

// Shapes taken from real files: a manga volume is ~170 one-image pages with no
// body text; a novel volume is ~18 illustrations across many chapters.
const mangaDeclaration: ContentFormDeclaration = {
	layout: "pre-paginated",
	spread: "landscape",
	declaresPageResolution: true,
};
const undeclared: ContentFormDeclaration = {
	layout: null,
	spread: null,
	declaresPageResolution: false,
};
const mangaSample: ContentFormSample = {
	textLength: 99,
	sampledDocuments: 12,
	imageCount: 169,
	documentCount: 170,
};
const novelSample: ContentFormSample = {
	textLength: 144_000,
	sampledDocuments: 12,
	imageCount: 15,
	documentCount: 34,
};

describe("contentFormFromDeclaration", () => {
	test("a marked pre-paginated package needs no content read", () => {
		expect(contentFormFromDeclaration(mangaDeclaration)).toBe("images");
		expect(
			contentFormFromDeclaration({
				layout: "pre-paginated",
				declaresPageResolution: true,
			}),
		).toBe("images");
	});

	test("a reflowable package is taken at its word", () => {
		expect(contentFormFromDeclaration({ layout: "reflowable" })).toBe("text");
	});

	// A fixed-layout novel declares pre-paginated without the comic markers.
	test("pre-paginated alone does not settle it", () => {
		expect(contentFormFromDeclaration({ layout: "pre-paginated" })).toBeNull();
		expect(contentFormFromDeclaration(undeclared)).toBeNull();
	});
});

describe("resolveContentForm", () => {
	test("a page-image volume and a text volume of the same series differ", () => {
		expect(resolveContentForm(mangaDeclaration, mangaSample)).toBe("images");
		expect(resolveContentForm({ layout: "reflowable" }, novelSample)).toBe(
			"text",
		);
	});

	test("the sample answers when the package declares nothing", () => {
		expect(resolveContentForm(undeclared, mangaSample)).toBe("images");
		expect(resolveContentForm(undeclared, novelSample)).toBe("text");
	});

	// The case that sets the threshold: extras carry real prose, but spread over
	// a volume's worth of pages they stay far from a page of writing.
	test("a colophon and an afterword do not turn page images into text", () => {
		expect(
			resolveContentForm(undeclared, { ...mangaSample, textLength: 210 }),
		).toBe("images");
		expect(
			resolveContentForm(undeclared, { ...mangaSample, textLength: 1_190 }),
		).toBe("images");
	});

	// Some publishers ship selectable dialogue over the artwork, which outweighs
	// any per-page budget; the declaration is what answers there.
	test("the declaration answers for page images carrying a dialogue layer", () => {
		const dialogue = { ...mangaSample, textLength: 8_400 };
		expect(resolveContentForm(mangaDeclaration, dialogue)).toBe("images");
		expect(resolveContentForm(undeclared, dialogue)).toBe("text");
	});

	// The sparsest text book measured held 303 characters a page; ordinary prose
	// starts around 1,370. Both must stay reachable by every provider.
	test("a page of writing is text however many illustrations surround it", () => {
		expect(
			resolveContentForm(undeclared, {
				textLength: 3_640,
				sampledDocuments: 12,
				imageCount: 145,
				documentCount: 148,
			}),
		).toBe("text");
	});

	test("an unmeasurable book stays reachable by every provider", () => {
		expect(resolveContentForm(undeclared)).toBe("text");
		expect(resolveContentForm(undeclared, null)).toBe("text");
		expect(
			resolveContentForm(undeclared, {
				textLength: 0,
				sampledDocuments: 0,
				imageCount: 0,
				documentCount: 0,
			}),
		).toBe("text");
	});
});

describe("contentFormTextBudget", () => {
	test("scales with the pages a reader plans to open", () => {
		expect(contentFormTextBudget(12)).toBe(1_200);
		// Never zero, so a single-document book still gets a real budget.
		expect(contentFormTextBudget(0)).toBeGreaterThan(0);
	});
});

describe("htmlBodyTextLength", () => {
	test("counts prose while dropping tags and whitespace", () => {
		expect(htmlBodyTextLength("<p>Hello   world</p>\n<p>foo</p>")).toBe(
			"Helloworldfoo".length,
		);
	});

	// The head carries title/style/script text that is not part of the prose.
	test("ignores the document head", () => {
		expect(
			htmlBodyTextLength(
				"<head><title>Cover</title><style>.a{color:red}</style></head><body><p>Text</p></body>",
			),
		).toBe("Text".length);
	});

	test("a page image with no prose measures near nothing", () => {
		expect(htmlBodyTextLength('<body><img src="p1.jpg"/></body>')).toBe(0);
	});
});

describe("htmlImageCount", () => {
	test("counts both HTML img and SVG image elements", () => {
		expect(
			htmlImageCount(
				'<img src="a.jpg"><p>x</p><svg><image href="b.jpg"/></svg><IMG src="c.jpg"/>',
			),
		).toBe(3);
	});

	test("prose with no illustrations counts zero", () => {
		expect(htmlImageCount("<p>just words, no imagery here</p>")).toBe(0);
	});
});
