import "@/test-utils/setup-dom";
import { describe, expect, it } from "bun:test";
import { getParagraphNodes } from "../get-paragraph-nodes";

function container(html: string) {
	const el = document.createElement("div");
	el.innerHTML = html;
	return el;
}

describe("getParagraphNodes", () => {
	it("returns text nodes with countable content", () => {
		const nodes = getParagraphNodes(container("<p>ねこ</p><p>  </p>"));
		expect(nodes).toHaveLength(1);
		expect(nodes[0].textContent).toBe("ねこ");
	});

	it("returns <img> elements as anchor nodes", () => {
		const nodes = getParagraphNodes(
			container('<div><img src="a.png" /></div><p>ねこ</p>'),
		);
		expect(nodes).toHaveLength(2);
		expect((nodes[0] as Element).tagName).toBe("IMG");
	});

	it("returns SVG <image> elements as anchor nodes", () => {
		const nodes = getParagraphNodes(
			container('<svg viewBox="0 0 100 100"><image href="a.png"/></svg>'),
		);
		expect(nodes).toHaveLength(1);
		expect((nodes[0] as Element).localName).toBe("image");
	});

	it("excludes images inside aria-hidden / hidden subtrees", () => {
		const nodes = getParagraphNodes(
			container(
				'<div aria-hidden="true"><img src="a.png"/></div>' +
					'<div hidden><img src="b.png"/></div>',
			),
		);
		expect(nodes).toHaveLength(0);
	});

	it("excludes ruby annotation text but keeps the base", () => {
		const nodes = getParagraphNodes(
			container("<p><ruby>猫<rt>ねこ</rt></ruby></p>"),
		);
		expect(nodes).toHaveLength(1);
		expect(nodes[0].textContent).toBe("猫");
	});
});
