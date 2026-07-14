import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BioMarkdown } from "../bio-markdown";

const render = (text: string) =>
	renderToStaticMarkup(<BioMarkdown text={text} />);

describe("BioMarkdown", () => {
	test("renders plain text in a paragraph", () => {
		const html = render("hello world");
		expect(html).toContain("<p>hello world</p>");
	});

	test("splits paragraphs on blank lines and lines on single newlines", () => {
		const html = render("line one\nline two\n\nsecond paragraph");
		expect(html).toContain("line one<br/>line two");
		expect(html).toContain("<p>second paragraph</p>");
	});

	test("renders markdown images", () => {
		const html = render("![my gif](https://example.com/cat.gif)");
		expect(html).toContain('src="https://example.com/cat.gif"');
		expect(html).toContain('alt="my gif"');
		expect(html).toContain("<img");
	});

	test("embeds bare image and gif URLs", () => {
		const html = render("https://example.com/banner.png?size=large");
		expect(html).toContain(
			'<img src="https://example.com/banner.png?size=large"',
		);
	});

	test("renders bare non-image URLs as links", () => {
		const html = render("check https://example.com/page out");
		expect(html).toContain('<a href="https://example.com/page"');
		expect(html).toContain('target="_blank"');
		expect(html).not.toContain("<img");
	});

	test("renders markdown links", () => {
		const html = render("[my site](https://example.com)");
		expect(html).toContain('<a href="https://example.com"');
		expect(html).toContain(">my site</a>");
	});

	test("renders bold and italic", () => {
		const html = render("**bold** and *italic*");
		expect(html).toContain("<strong");
		expect(html).toContain("bold</strong>");
		expect(html).toContain("<em>italic</em>");
	});

	test("drops javascript: URLs in markdown links and images", () => {
		const html = render("[x](javascript:alert(1)) ![y](javascript:alert(2))");
		expect(html).not.toContain("javascript:");
		expect(html).not.toContain("<a ");
		expect(html).not.toContain("<img");
	});

	test("escapes raw HTML instead of injecting it", () => {
		const html = render('<script>alert("xss")</script>');
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
	});
});
