import { describe, expect, test } from "bun:test";
import { encodeCollectionCursor, parseCollectionCursor } from "./opds.routes";
import { buildAcquisitionFeed, buildNavigationFeed } from "./opds.xml";

describe("Dynamic Collections OPDS", () => {
	test("round-trips bounded opaque collection cursors", () => {
		const encoded = encodeCollectionCursor(20);
		expect(encoded).not.toBe("20");
		expect(parseCollectionCursor(encoded)).toBe(20);
		expect(parseCollectionCursor("not-a-cursor")).toBe(0);
		expect(parseCollectionCursor(encodeCollectionCursor(1_000_001))).toBe(0);
	});

	test("escapes collection identity and keeps its subsection link", () => {
		const xml = buildNavigationFeed(
			[
				{
					title: 'Unread <books> & "notes"',
					href: "/opds/collections/dynamic/example?a=1&b=2",
					id: "urn:nanahoshi:dynamic-collection:example",
				},
			],
			{
				id: "urn:nanahoshi:dynamic-collections",
				title: "Dynamic Collections",
				selfHref: "/opds/collections/dynamic",
			},
		);

		expect(xml).toContain("Unread &lt;books&gt; &amp; &quot;notes&quot;");
		expect(xml).toContain("?a=1&amp;b=2");
		expect(xml).not.toContain("Unread <books>");
	});

	test("emits an encoded next link for acquisition paging and search", () => {
		const cursor = encodeCollectionCursor(10);
		const xml = buildAcquisitionFeed([], {
			id: "urn:nanahoshi:dynamic-collection:example",
			title: "Unread",
			selfHref: "/opds/collections/dynamic/example",
			nextHref: `/opds/collections/dynamic/example?cursor=${cursor}&q=space%20opera`,
		});

		expect(xml).toContain('rel="next"');
		expect(xml).toContain(`cursor=${cursor}&amp;q=space%20opera`);
	});
});
