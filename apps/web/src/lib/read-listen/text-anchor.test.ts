import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import {
	createReadListenPositionIndex,
	findReadListenTargetAtPosition,
	installReadListenActiveHighlight,
	installReadListenHoverHighlight,
	resolveReadListenAnchor,
} from "./text-anchor";

describe("Read & Listen text anchors", () => {
	test("resolves a quote split across markup while excluding furigana", () => {
		const dom = new JSDOM(
			"<section><p>これは<em>本<ruby>文<rt>ぶん</rt></ruby></em>です。</p></section>",
		);
		const section = dom.window.document.querySelector("section");
		if (!section) throw new Error("fixture section missing");

		const resolved = resolveReadListenAnchor(section, {
			kind: "text-quote",
			sectionRef: "chapter.xhtml",
			exact: "これは本文です。",
		});

		expect(
			resolved?.segments.map((segment) => segment.node.data).join(""),
		).toBe("これは本文です。");
	});

	test("paints and clears the active sentence without changing book markup", () => {
		const dom = new JSDOM("<section><p>First <em>sentence</em>.</p></section>");
		const section = dom.window.document.querySelector("section");
		if (!section) throw new Error("fixture section missing");
		const resolved = resolveReadListenAnchor(section, {
			kind: "text-quote",
			sectionRef: "chapter.xhtml",
			exact: "First sentence.",
		});
		if (!resolved) throw new Error("fixture quote missing");
		const highlights = new Map<string, unknown>();
		Object.defineProperty(dom.window, "CSS", {
			value: {
				highlights: {
					set: (name: string, value: unknown) => highlights.set(name, value),
					delete: (name: string) => highlights.delete(name),
				},
			},
		});
		Object.defineProperty(dom.window, "Highlight", { value: class {} });

		const cleanup = installReadListenActiveHighlight(resolved);

		expect(highlights.has("read-listen-active")).toBe(true);
		expect(section.innerHTML).toBe("<p>First <em>sentence</em>.</p>");
		cleanup?.();
		expect(highlights.has("read-listen-active")).toBe(false);
	});

	test("maps a clicked text position to the correct aligned sentence", () => {
		const dom = new JSDOM(
			"<section><p>同じ文。<em>中央の文。</em>同じ文。</p></section>",
		);
		const section = dom.window.document.querySelector("section");
		const paragraph = section?.querySelector("p");
		const lastText = paragraph?.lastChild;
		if (!section || !lastText || lastText.nodeType !== 3) {
			throw new Error("fixture text missing");
		}

		const selected = findReadListenTargetAtPosition(
			section,
			[
				{
					anchor: {
						kind: "text-quote",
						sectionRef: "chapter.xhtml",
						exact: "同じ文。",
						suffix: "中央の文。",
					},
					value: "first",
				},
				{
					anchor: {
						kind: "text-quote",
						sectionRef: "chapter.xhtml",
						exact: "中央の文。",
					},
					value: "middle",
				},
				{
					anchor: {
						kind: "text-quote",
						sectionRef: "chapter.xhtml",
						exact: "同じ文。",
						prefix: "中央の文。",
					},
					value: "last",
				},
			],
			{ node: lastText as Text, offset: 2 },
		);

		expect(selected).toBe("last");
	});

	test("prepares a reusable cue index with the exact hover segments", () => {
		const dom = new JSDOM(
			"<section><p>Antes. <em>Segmento dividido</em> aquí. Después.</p></section>",
		);
		const section = dom.window.document.querySelector("section");
		const emphasizedText = section?.querySelector("em")?.firstChild;
		if (!section || !emphasizedText || emphasizedText.nodeType !== 3) {
			throw new Error("fixture text missing");
		}
		const index = createReadListenPositionIndex(section, [
			{
				anchor: {
					kind: "text-quote",
					sectionRef: "chapter.xhtml",
					exact: "Segmento dividido aquí.",
				},
				value: "cue-1",
			},
		]);

		const match = index.find({ node: emphasizedText as Text, offset: 4 });

		expect(match?.value).toBe("cue-1");
		expect(
			match?.resolved.segments
				.map((segment) =>
					segment.node.data.slice(segment.startOffset, segment.endOffset),
				)
				.join(""),
		).toBe("Segmento dividido aquí.");
	});

	test("maps repeated quotes in their declared reading order", () => {
		const dom = new JSDOM("<section><p>同じ文。同じ文。同じ文。</p></section>");
		const section = dom.window.document.querySelector("section");
		const text = section?.querySelector("p")?.firstChild;
		if (!section || !text || text.nodeType !== 3) {
			throw new Error("fixture text missing");
		}
		const index = createReadListenPositionIndex(
			section,
			["first", "second", "third"].map((value) => ({
				anchor: {
					kind: "text-quote" as const,
					sectionRef: "chapter.xhtml",
					exact: "同じ文。",
				},
				value,
			})),
		);

		expect(index.find({ node: text as Text, offset: 6 })?.value).toBe("second");
		expect(index.find({ node: text as Text, offset: 10 })?.value).toBe("third");
	});

	test("paints and clears a multi-range hover without changing the DOM", () => {
		const dom = new JSDOM(
			"<section><p>Segmento <em>dividido</em>.</p></section>",
		);
		const section = dom.window.document.querySelector("section");
		if (!section) throw new Error("fixture section missing");
		const resolved = resolveReadListenAnchor(section, {
			kind: "text-quote",
			sectionRef: "chapter.xhtml",
			exact: "Segmento dividido.",
		});
		if (!resolved) throw new Error("fixture quote missing");
		const highlights = new Map<string, unknown>();
		Object.defineProperty(dom.window, "CSS", {
			value: {
				highlights: {
					set: (name: string, value: unknown) => highlights.set(name, value),
					delete: (name: string) => highlights.delete(name),
				},
			},
		});
		Object.defineProperty(dom.window, "Highlight", {
			value: class {},
		});

		const cleanup = installReadListenHoverHighlight(resolved);

		expect(highlights.has("read-listen-hover")).toBe(true);
		expect(section.innerHTML).toBe("<p>Segmento <em>dividido</em>.</p>");
		cleanup?.();
		expect(highlights.has("read-listen-hover")).toBe(false);
	});
});
