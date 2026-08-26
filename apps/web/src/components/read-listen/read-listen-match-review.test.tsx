import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MatchPublicationArtwork } from "./read-listen-match-review";

describe("MatchPublicationArtwork", () => {
	test("renders responsive cover artwork when a cover is available", () => {
		const markup = renderToStaticMarkup(
			<MatchPublicationArtwork
				cover="data/covers/example_600w.jpg"
				mediaType="ebook"
			/>,
		);

		expect(markup).toContain("<img");
		expect(markup).toContain("/api/data/covers/example_600w.jpg");
		expect(markup).toContain("srcSet=");
	});

	test("keeps the media icon as the missing-cover fallback", () => {
		const markup = renderToStaticMarkup(
			<MatchPublicationArtwork cover={null} mediaType="audiobook" />,
		);

		expect(markup).not.toContain("<img");
		expect(markup).toContain("<svg");
	});
});
