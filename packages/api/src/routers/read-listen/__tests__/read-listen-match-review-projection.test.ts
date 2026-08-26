import { describe, expect, mock, test } from "bun:test";
import type { ReadListenMatchProposalPageRow } from "../read-listen.repository";
import { ReadListenMatchReviewProjection } from "../read-listen-match-review-projection";

describe("ReadListenMatchReviewProjection", () => {
	test("keeps the exact total when an offset becomes empty", async () => {
		const totalRow = {
			id: "00000000-0000-4000-8000-000000000001",
			totalCount: 12,
		} as ReadListenMatchProposalPageRow;
		const store = {
			listMatchProposalPage: mock()
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([totalRow]),
			listPublicationsByIds: mock(() => Promise.resolve([])),
		};
		const projection = new ReadListenMatchReviewProjection(store as never);

		const result = await projection.list({
			status: "pending",
			offset: 20,
			limit: 10,
			serverId: "server-1",
			editableScope: [7],
		});

		expect(result).toEqual({ items: [], total: 12 });
		expect(store.listMatchProposalPage).toHaveBeenCalledTimes(2);
		expect(store.listMatchProposalPage.mock.calls[0]?.[1]).toEqual([7]);
	});
});
