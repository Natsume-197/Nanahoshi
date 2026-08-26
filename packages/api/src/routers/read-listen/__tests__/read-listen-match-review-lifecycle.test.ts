import { describe, expect, mock, test } from "bun:test";
import { ConflictError, NotFoundError } from "../../../errors";
import type {
	ReadListenMatchProposalRow,
	ReadListenPublication,
} from "../read-listen.repository";
import { ReadListenMatchReviewLifecycle } from "../read-listen-match-review-lifecycle";

const audiobook: ReadListenPublication = {
	id: 20,
	catalogHash: "audio",
	uuid: "00000000-0000-4000-8000-000000000020",
	mediaType: "audiobook",
	filename: "audio.m4b",
	title: "Book",
	cover: null,
	mainColor: null,
	languageCode: "en",
	duration: 100,
	abridged: false,
	libraryUuid: "00000000-0000-4000-8000-000000000200",
	libraryName: "Audio",
	authors: [],
	narrators: [],
	series: [],
};
const ebook: ReadListenPublication = {
	...audiobook,
	id: 10,
	uuid: "00000000-0000-4000-8000-000000000010",
	mediaType: "ebook",
	filename: "book.epub",
	duration: null,
	abridged: null,
};
const proposal: ReadListenMatchProposalRow = {
	id: "00000000-0000-4000-8000-000000000050",
	serverId: "server-1",
	audiobookBookId: audiobook.id,
	ebookBookId: ebook.id,
	score: 90,
	confidence: "high",
	reasons: [],
	warnings: [],
	matcherVersion: "rules-v6",
	status: "pending",
	createdAt: "2026-08-25T00:00:00.000Z",
	updatedAt: "2026-08-25T00:00:00.000Z",
};

function createHarness() {
	const store = {
		getMatchProposalRow: mock(() => Promise.resolve(proposal)),
		getPairRow: mock(() => Promise.resolve(null)),
		getPublicationByUuid: mock(() => Promise.resolve(ebook)),
		listPublicationsByIds: mock(() => Promise.resolve([audiobook, ebook])),
		listMatchProposalPage: mock(() =>
			Promise.resolve([{ ...proposal, totalCount: 1, origin: "matcher" }]),
		),
		decideMatchProposals: mock(() =>
			Promise.resolve([
				{
					decision: {
						id: "decision-1",
						proposalId: proposal.id,
						action: "approve" as const,
						selectedEbookBookId: ebook.id,
						decidedByUserId: "user-1",
						createdAt: "2026-08-25T00:00:00.000Z",
					},
					pair: null,
				},
			]),
		),
		deleteReviewedMatches: mock(() => Promise.resolve(1)),
	};
	return {
		store,
		lifecycle: new ReadListenMatchReviewLifecycle(store as never),
	};
}

describe("ReadListenMatchReviewLifecycle", () => {
	test("submits the whole approval set through one atomic store operation", async () => {
		const { lifecycle, store } = createHarness();
		await lifecycle.decide({
			decisions: [{ proposalUuid: proposal.id, action: "approve" }],
			decidedByUserId: "user-1",
			serverId: "server-1",
			scope: [7],
		});

		expect(store.decideMatchProposals).toHaveBeenCalledTimes(1);
		expect(store.decideMatchProposals).toHaveBeenCalledWith([
			expect.objectContaining({
				proposal,
				action: "approve",
				selectedEbookBookId: ebook.id,
			}),
		]);
	});

	test("rejects competing approvals before opening the transaction", async () => {
		const { lifecycle, store } = createHarness();
		store.getMatchProposalRow
			.mockResolvedValueOnce(proposal)
			.mockResolvedValueOnce({
				...proposal,
				id: "00000000-0000-4000-8000-000000000051",
			});

		await expect(
			lifecycle.decide({
				decisions: [
					{ proposalUuid: proposal.id, action: "approve" },
					{
						proposalUuid: "00000000-0000-4000-8000-000000000051",
						action: "approve",
					},
				],
				decidedByUserId: "user-1",
				serverId: "server-1",
				scope: "ALL",
			}),
		).rejects.toBeInstanceOf(ConflictError);
		expect(store.decideMatchProposals).not.toHaveBeenCalled();
	});

	test("does not remove a review outside the editable scope", async () => {
		const { lifecycle, store } = createHarness();
		store.listPublicationsByIds.mockResolvedValueOnce([audiobook]);

		await expect(
			lifecycle.remove({
				reviewIds: [proposal.id],
				serverId: "server-1",
				scope: [7],
			}),
		).rejects.toBeInstanceOf(NotFoundError);
		expect(store.deleteReviewedMatches).not.toHaveBeenCalled();
	});

	test("removes a pending proposal through the atomic review operation", async () => {
		const { lifecycle, store } = createHarness();

		const result = await lifecycle.remove({
			reviewIds: [proposal.id],
			serverId: "server-1",
			scope: "ALL",
		});

		expect(store.deleteReviewedMatches).toHaveBeenCalledTimes(1);
		expect(store.deleteReviewedMatches).toHaveBeenCalledWith(
			[proposal.id],
			"server-1",
		);
		expect(result).toEqual({ removedCount: 1 });
	});

	test("resolves a select-all filter inside the review lifecycle", async () => {
		const { lifecycle, store } = createHarness();

		await lifecycle.removeSelection({
			target: { filter: { status: "pending", query: "Book" } },
			serverId: "server-1",
			scope: "ALL",
		});

		expect(store.listMatchProposalPage).toHaveBeenCalledWith(
			"server-1",
			"ALL",
			expect.objectContaining({
				status: "pending",
				query: "Book",
				offset: 0,
				limit: 500,
			}),
		);
		expect(store.deleteReviewedMatches).toHaveBeenCalledWith(
			[proposal.id],
			"server-1",
		);
	});
});
