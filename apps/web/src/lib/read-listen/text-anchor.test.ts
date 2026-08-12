import { describe, expect, mock, test } from "bun:test";
import { JSDOM } from "jsdom";
import {
	createReadListenPositionIndex,
	findReadListenTargetAtPosition,
	getReadListenPositionIndex,
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

	test("does not turn a missing fragment into a whole-section match", () => {
		const dom = new JSDOM("<section><p>Visible text.</p></section>");
		const section = dom.window.document.querySelector("section");
		if (!section) throw new Error("fixture section missing");
		const anchor = {
			kind: "fragment" as const,
			sectionRef: "chapter.xhtml",
			fragmentId: "missing",
		};

		expect(resolveReadListenAnchor(section, anchor)).toBeNull();
		expect(
			createReadListenPositionIndex(section, [
				{ anchor, value: "missing-fragment" },
			]).matches,
		).toHaveLength(0);
	});

	test("finds a fragment cue through descendants that have their own ids", () => {
		const dom = new JSDOM(
			'<section><p id="sentence"><span id="word">Nested text.</span></p></section>',
		);
		const section = dom.window.document.querySelector("section");
		const text = dom.window.document.querySelector("span")?.firstChild;
		if (!section || !text || text.nodeType !== 3) {
			throw new Error("fixture text missing");
		}
		const target = {
			anchor: {
				kind: "fragment" as const,
				sectionRef: "chapter.xhtml",
				fragmentId: "sentence",
			},
			value: "fragment-cue",
		};

		const index = createReadListenPositionIndex(section, [target]);

		expect(index.find({ node: text as Text, offset: 3 })?.value).toBe(
			"fragment-cue",
		);
	});

	test("prefers an exact sentence over an enclosing fragment at the same point", () => {
		const dom = new JSDOM(
			'<section><p id="paragraph">First. Second.</p></section>',
		);
		const section = dom.window.document.querySelector("section");
		const text = dom.window.document.querySelector("p")?.firstChild;
		if (!section || !text || text.nodeType !== 3) {
			throw new Error("fixture text missing");
		}
		const index = createReadListenPositionIndex(section, [
			{
				anchor: {
					kind: "fragment",
					sectionRef: "chapter.xhtml",
					fragmentId: "paragraph",
				},
				value: "coarse-fragment",
			},
			{
				anchor: {
					kind: "text-quote",
					sectionRef: "chapter.xhtml",
					exact: "Second.",
				},
				value: "exact-sentence",
			},
		]);

		expect(index.find({ node: text as Text, offset: 9 })?.value).toBe(
			"exact-sentence",
		);
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

	test("reuses one immutable index for the same rendered section and alignment", () => {
		const dom = new JSDOM("<section><p>はい。はい。</p></section>");
		const section = dom.window.document.querySelector("section");
		if (!section) throw new Error("fixture section missing");
		const createTreeWalker = mock(
			dom.window.document.createTreeWalker.bind(dom.window.document),
		);
		Object.defineProperty(dom.window.document, "createTreeWalker", {
			value: createTreeWalker,
		});
		const targets = ["first", "second"].map((value) => ({
			anchor: {
				kind: "text-quote" as const,
				sectionRef: "chapter.xhtml",
				exact: "はい",
			},
			value,
		}));

		const firstRead = getReadListenPositionIndex(section, targets);
		const secondRead = getReadListenPositionIndex(section, targets);

		expect(secondRead).toBe(firstRead);
		expect(createTreeWalker).toHaveBeenCalledTimes(1);
	});

	test("replaces the cached index when the alignment target list changes", () => {
		const dom = new JSDOM("<section><p>はい。はい。</p></section>");
		const section = dom.window.document.querySelector("section");
		if (!section) throw new Error("fixture section missing");
		const target = {
			anchor: {
				kind: "text-quote" as const,
				sectionRef: "chapter.xhtml",
				exact: "はい",
			},
			value: "first",
		};

		const oldAlignment = getReadListenPositionIndex(section, [target]);
		const newAlignment = getReadListenPositionIndex(section, [target]);

		expect(newAlignment).not.toBe(oldAlignment);
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
		expect(index.get("second")?.resolved.segments[0]?.startOffset).toBe(4);
	});

	test("never reuses an earlier occurrence for a later missing cue", () => {
		const dom = new JSDOM("<section><p>はい。</p></section>");
		const section = dom.window.document.querySelector("section");
		if (!section) throw new Error("fixture section missing");
		const index = createReadListenPositionIndex(
			section,
			["first", "missing-second"].map((value) => ({
				anchor: {
					kind: "text-quote" as const,
					sectionRef: "chapter.xhtml",
					exact: "はい",
				},
				value,
			})),
		);

		expect(index.matches.map((match) => match.value)).toEqual(["first"]);
	});

	test("continues after an unmatched cue without shifting later anchors", () => {
		const dom = new JSDOM("<section><p>一。三。</p></section>");
		const section = dom.window.document.querySelector("section");
		if (!section) throw new Error("fixture section missing");
		const targets = ["一", "二", "三"].map((exact) => ({
			anchor: {
				kind: "text-quote" as const,
				sectionRef: "chapter.xhtml",
				exact,
			},
			value: exact,
		}));

		const index = createReadListenPositionIndex(section, targets);

		expect(index.get("二")).toBeUndefined();
		expect(index.get("三")?.resolved.segments[0]?.startOffset).toBe(2);
	});

	test("keeps identical normalized quotes distinct across markup and whitespace", () => {
		const dom = new JSDOM(
			"<section><p><em>Hai   there.</em> <strong>Hai\nthere.</strong></p></section>",
		);
		const section = dom.window.document.querySelector("section");
		if (!section) throw new Error("fixture section missing");
		const targets = ["first", "second"].map((value) => ({
			anchor: {
				kind: "text-quote" as const,
				sectionRef: "chapter.xhtml",
				exact: "Hai there.",
			},
			value,
		}));

		const index = createReadListenPositionIndex(section, targets);

		expect(
			index.get("first")?.resolved.segments[0]?.node.parentElement?.tagName,
		).toBe("EM");
		expect(
			index.get("second")?.resolved.segments[0]?.node.parentElement?.tagName,
		).toBe("STRONG");
	});

	test("maps a long run of identical short cues to unique occurrences", () => {
		const count = 256;
		const dom = new JSDOM(
			`<section><p>${Array.from({ length: count }, () => "はい。").join("")}</p></section>`,
		);
		const section = dom.window.document.querySelector("section");
		if (!section) throw new Error("fixture section missing");
		const cues = Array.from({ length: count }, (_, index) => ({ index }));
		const targets = cues.map((cue) => ({
			anchor: {
				kind: "text-quote" as const,
				sectionRef: "chapter.xhtml",
				exact: "はい",
			},
			value: cue,
		}));

		const index = createReadListenPositionIndex(section, targets);
		const offsets = cues.map(
			(cue) => index.get(cue)?.resolved.segments[0]?.startOffset,
		);

		expect(offsets).toEqual(
			Array.from({ length: count }, (_, occurrence) => occurrence * 3),
		);
		expect(new Set(offsets).size).toBe(count);
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
