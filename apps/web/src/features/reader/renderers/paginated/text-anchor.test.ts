import "@/test-utils/setup-dom";
import { describe, expect, test } from "bun:test";
import { resolveReaderTextAnchorOffset } from "./text-anchor";

function sectionFromHtml(html: string) {
	const section = document.createElement("section");
	section.id = "chapter";
	section.innerHTML = html;
	return section;
}

describe("reader text anchors", () => {
	test("resolves a repeated quote by occurrence", () => {
		const section = sectionFromHtml("<p>先。対象。中。対象。後。</p>");

		expect(
			resolveReaderTextAnchorOffset(section, {
				kind: "text-quote",
				sectionReference: "chapter",
				exact: "対象",
				occurrence: 1,
			}),
		).toBe(4);
	});

	test("uses quote context when no occurrence is supplied", () => {
		const section = sectionFromHtml("<p>甲対象乙。丙対象丁。</p>");

		expect(
			resolveReaderTextAnchorOffset(section, {
				kind: "text-quote",
				sectionReference: "chapter",
				exact: "対象",
				prefix: "丙",
				suffix: "丁",
			}),
		).toBe(5);
	});

	test("keeps DOM offsets aligned after supplementary Unicode characters", () => {
		const section = sectionFromHtml("<p>😀対象。</p>");

		expect(
			resolveReaderTextAnchorOffset(section, {
				kind: "text-quote",
				sectionReference: "chapter",
				exact: "対象",
			}),
		).toBe(0);
	});

	test("resolves a fragment after earlier content", () => {
		const section = sectionFromHtml('<p>一。<span id="target">二。</span></p>');

		expect(
			resolveReaderTextAnchorOffset(section, {
				kind: "fragment",
				sectionReference: "chapter",
				fragmentId: "target",
			}),
		).toBe(1);
	});
});
