import { beforeAll, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import {
	buildFocusDocument,
	findFocusSentenceIndex,
	focusSentenceHtml,
	loadFocusDocument,
	resolveFocusTextAnchor,
} from "./focus-sentences";

beforeAll(() => {
	const dom = new JSDOM("<!doctype html><html><body></body></html>");
	Object.assign(globalThis, {
		HTMLElement: dom.window.HTMLElement,
		HTMLImageElement: dom.window.HTMLImageElement,
		Node: dom.window.Node,
	});
});

describe("Focus sentence document", () => {
	test("segments each block into sentences while preserving inline markup", async () => {
		const dom = new JSDOM("<!doctype html><html><body></body></html>");
		const result = await buildFocusDocument({
			document: dom.window.document,
			language: "ja",
			htmlContent: `
				<section id="nanahoshi-chapter-1">
					<p>最初の<em>文</em>です。次です。</p>
					<p id="anchor">句点なし</p>
				</section>`,
		});

		expect(result.sentences.map((sentence) => sentence.text)).toEqual([
			"最初の文です。",
			"次です。",
			"句点なし",
		]);
		const firstSentence = result.sentences[0];
		expect(firstSentence).toBeDefined();
		expect(
			firstSentence && focusSentenceHtml(dom.window.document, firstSentence),
		).toContain("<em>文</em>");
		expect(result.anchorCharacters.get("anchor")).toBe(9);
	});

	test("keeps ruby markup without counting pronunciation as book text", async () => {
		const dom = new JSDOM("<!doctype html><html><body></body></html>");
		const result = await buildFocusDocument({
			document: dom.window.document,
			language: "ja",
			htmlContent:
				'<section id="nanahoshi-ruby"><p><ruby>漢<rt>かん</rt></ruby>字です。</p></section>',
		});

		expect(result.sentences[0]?.text).toBe("漢字です。");
		const sentence = result.sentences[0];
		expect(sentence).toBeDefined();
		expect(
			sentence && focusSentenceHtml(dom.window.document, sentence),
		).toContain("<rt>かん</rt>");
		expect(result.totalCharacters).toBe(4);
	});

	test("restores the sentence after an exactly completed sentence", async () => {
		const dom = new JSDOM("<!doctype html><html><body></body></html>");
		const result = await buildFocusDocument({
			document: dom.window.document,
			language: "en",
			htmlContent:
				'<section id="nanahoshi-en"><p>First sentence. Second sentence.</p></section>',
		});
		const firstEnd = result.sentences[0]?.endCharacter ?? 0;

		expect(findFocusSentenceIndex(result.sentences, 0)).toBe(0);
		expect(findFocusSentenceIndex(result.sentences, firstEnd)).toBe(1);
	});

	test("shares a prepared document with the Focus reader", async () => {
		const dom = new JSDOM("<!doctype html><html><body></body></html>");
		const input = {
			cacheKey: "prepared-focus-document",
			document: dom.window.document,
			language: "en",
			htmlContent:
				'<section id="nanahoshi-prepared"><p>Ready before Focus opens.</p></section>',
		};

		const prepared = loadFocusDocument(input);
		const consumedByFocus = loadFocusDocument(input);

		expect(consumedByFocus).toBe(prepared);
		expect((await consumedByFocus).sentences[0]?.text).toBe(
			"Ready before Focus opens.",
		);
	});

	test("keeps image weight in the shared character coordinate", async () => {
		const dom = new JSDOM("<!doctype html><html><body></body></html>");
		Object.assign(globalThis, {
			HTMLElement: dom.window.HTMLElement,
			HTMLImageElement: dom.window.HTMLImageElement,
			Node: dom.window.Node,
		});
		const result = await buildFocusDocument({
			document: dom.window.document,
			language: "ja",
			htmlContent:
				'<section id="nanahoshi-image"><img src="cover.jpg"><p>本文です。</p></section>',
		});

		expect(result.sentences.map((sentence) => sentence.kind)).toEqual([
			"image",
			"text",
		]);
		expect(result.sentences[0]?.html).toContain('src="cover.jpg"');
		expect(result.sentences[0]?.startCharacter).toBe(0);
		expect(result.sentences[1]?.startCharacter).toBe(1);
		expect(result.totalCharacters).toBe(5);
	});

	test("keeps gaiji in the running text instead of showing it alone", async () => {
		const dom = new JSDOM("<!doctype html><html><body></body></html>");
		Object.assign(globalThis, {
			HTMLElement: dom.window.HTMLElement,
			HTMLImageElement: dom.window.HTMLImageElement,
			Node: dom.window.Node,
		});
		const result = await buildFocusDocument({
			document: dom.window.document,
			language: "ja",
			htmlContent:
				'<section id="nanahoshi-gaiji"><p>髙<img class="gaiji" src="g.png">島です。</p></section>',
		});

		expect(result.sentences.map((sentence) => sentence.kind)).toEqual(["text"]);
		expect(result.sentences[0]?.html).toContain('class="gaiji"');
	});

	test("keeps non-Latin writing systems readable", async () => {
		const dom = new JSDOM("<!doctype html><html><body></body></html>");
		const result = await buildFocusDocument({
			document: dom.window.document,
			language: "ko",
			htmlContent:
				'<section id="nanahoshi-world"><p>한국어 문장입니다.</p><p>Привет мир.</p><p>مرحبا بالعالم.</p></section>',
		});

		expect(result.sentences.map((sentence) => sentence.text)).toEqual([
			"한국어 문장입니다.",
			"Привет мир.",
			"مرحبا بالعالم.",
		]);
		expect(result.totalCharacters).toBeGreaterThan(20);
	});

	test("resolves quotes and internal anchors to exact characters", async () => {
		const dom = new JSDOM("<!doctype html><html><body></body></html>");
		const result = await buildFocusDocument({
			document: dom.window.document,
			language: "en",
			htmlContent:
				'<section id="nanahoshi-chapter"><p>First sentence.</p><h2 id="middle">Middle heading</h2><p>Target sentence.</p></section>',
		});

		expect(
			resolveFocusTextAnchor(result, {
				kind: "fragment",
				sectionReference: "nanahoshi-chapter",
				fragmentId: "middle",
			}),
		).toBe(result.anchorCharacters.get("middle"));
		expect(
			resolveFocusTextAnchor(result, {
				kind: "text-quote",
				sectionReference: "nanahoshi-chapter",
				exact: "Target sentence.",
			}),
		).toBe(result.sentences.at(-1)?.startCharacter);
	});

	test("keeps repeated Read & Listen quotes on their declared occurrence", async () => {
		const dom = new JSDOM("<!doctype html><html><body></body></html>");
		const result = await buildFocusDocument({
			document: dom.window.document,
			language: "ja",
			htmlContent:
				'<section id="nanahoshi-repeat"><p>はい。はい。はい。</p></section>',
		});

		expect(
			resolveFocusTextAnchor(result, {
				kind: "text-quote",
				sectionReference: "nanahoshi-repeat",
				exact: "はい。",
				occurrence: 1,
			}),
		).toBe(result.sentences[1]?.startCharacter);
	});

	test("stops preparing Focus as soon as its reader unmounts", async () => {
		const dom = new JSDOM("<!doctype html><html><body></body></html>");
		const controller = new AbortController();
		controller.abort();

		expect(
			buildFocusDocument({
				document: dom.window.document,
				language: "en",
				htmlContent:
					'<section id="nanahoshi-abort"><p>Never parsed.</p></section>',
				signal: controller.signal,
			}),
		).rejects.toThrow();
	});
});
