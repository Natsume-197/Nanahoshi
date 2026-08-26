import { describe, expect, test } from "bun:test";
import type {
	ReadListenMatchProposalRow,
	ReadListenPublication,
} from "../read-listen.repository";
import { buildReadListenMatchProposal } from "../read-listen-match-view";

describe("pending Read & Listen match removal", () => {
	test("exposes a pending proposal as removable so its audiobook can be retried", () => {
		const proposal = {
			id: "00000000-0000-4000-8000-000000000050",
			serverId: "server-1",
			audiobookBookId: 20,
			ebookBookId: 10,
			score: 80,
			confidence: "high",
			reasons: [],
			warnings: [],
			matcherVersion: "rules-v6",
			status: "pending",
			createdAt: "2026-08-26T00:00:00.000Z",
			updatedAt: "2026-08-26T00:00:00.000Z",
		} satisfies ReadListenMatchProposalRow;
		const base = {
			catalogHash: "hash",
			cover: null,
			mainColor: null,
			languageCode: null,
			libraryUuid: "00000000-0000-4000-8000-000000000100",
			libraryName: "Library",
			authors: [],
			narrators: [],
			series: [],
		};
		const publications = new Map<number, ReadListenPublication>([
			[
				10,
				{
					...base,
					id: 10,
					uuid: "00000000-0000-4000-8000-000000000010",
					mediaType: "ebook",
					filename: "book.epub",
					title: "Book",
					duration: null,
					abridged: null,
				},
			],
			[
				20,
				{
					...base,
					id: 20,
					uuid: "00000000-0000-4000-8000-000000000020",
					mediaType: "audiobook",
					filename: "book.m4b",
					title: "Book",
					duration: 100,
					abridged: false,
				},
			],
		]);

		expect(
			buildReadListenMatchProposal(proposal, publications)?.removable,
		).toBe(true);
	});
});
