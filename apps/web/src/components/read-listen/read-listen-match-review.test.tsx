import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	getRemovalTarget,
	getReviewSelectionTarget,
	MatchPublicationArtwork,
} from "./read-listen-match-review";

describe("getReviewSelectionTarget", () => {
	test("targets the complete active filter after selecting all results", () => {
		expect(
			getReviewSelectionTarget({
				selectAllFilter: true,
				status: "pending",
				query: "Dune",
				selected: ["only-the-current-page"],
			}),
		).toEqual({ filter: { status: "pending", query: "Dune" } });
	});
});

describe("getRemovalTarget", () => {
	test("uses the proposal when a reviewed match was rejected", () => {
		expect(
			getRemovalTarget({
				id: "proposal-1",
				removable: true,
				status: "decided",
			}),
		).toEqual({ proposalUuid: "proposal-1", kind: "reviewed" });
	});

	test("uses the active pair for an approved reviewed match", () => {
		expect(
			getRemovalTarget({
				id: "proposal-1",
				removable: true,
				status: "decided",
			}),
		).toEqual({ proposalUuid: "proposal-1", kind: "reviewed" });
	});

	test("uses the proposal for a pending result that will be retried", () => {
		expect(
			getRemovalTarget({
				id: "proposal-1",
				removable: true,
				status: "pending",
			}),
		).toEqual({ proposalUuid: "proposal-1", kind: "pending" });
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
