import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	getRemovalTarget,
	MatchPublicationArtwork,
} from "./read-listen-match-review";

describe("getRemovalTarget", () => {
	test("uses the proposal when a reviewed match was rejected", () => {
		expect(
			getRemovalTarget({
				id: "proposal-1",
				decision: {
					action: "reject",
					selectedEbook: null,
					pairUuid: null,
				},
			}),
		).toEqual({ kind: "proposal", uuid: "proposal-1" });
	});

	test("uses the active pair for an approved reviewed match", () => {
		expect(
			getRemovalTarget({
				id: "proposal-1",
				decision: {
					action: "approve",
					selectedEbook: null,
					pairUuid: "pair-1",
				},
			}),
		).toEqual({ kind: "pair", uuid: "pair-1" });
	});
});

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
