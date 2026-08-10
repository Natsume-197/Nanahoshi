import { beforeAll, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { findReadListenCueNearCharacter } from "./text-position";

beforeAll(() => {
	const dom = new JSDOM("<!doctype html><html><body></body></html>");
	Object.assign(globalThis, {
		HTMLElement: dom.window.HTMLElement,
		Node: dom.window.Node,
		HTMLImageElement: dom.window.HTMLImageElement,
	});
});

describe("Read & Listen text position", () => {
	test("selects the cue nearest to the reader's character coordinate", () => {
		const dom = new JSDOM(
			'<section id="ttu-epub-chapter-xhtml"><p>一。</p><p>二。</p><p>三。</p></section>',
		);
		const id = "ttu-epub-chapter-xhtml";
		const targets = ["first", "second", "third"].map((value, index) => ({
			anchor: {
				kind: "text-quote" as const,
				sectionRef: "chapter.xhtml",
				exact: `${["一", "二", "三"][index]}。`,
			},
			value,
		}));

		expect(
			findReadListenCueNearCharacter({
				targetCharacter: 102,
				sections: [
					{
						reference: id,
						charactersWeight: 1,
						startCharacter: 100,
						characters: 3,
					},
				],
				targetsBySection: new Map([[id, targets]]),
				document: dom.window.document,
			}),
		).toBe("third");
	});
});
