import { BadRequestError, NotFoundError } from "../../errors";
import type {
	SearchBooksRequest,
	SearchBooksResponse,
} from "../../infrastructure/search/search.types";
import type { LibraryScope } from "../_shared/library-scope";
import * as bookService from "../books/book.service";
import {
	type ReadListenRepository,
	readListenRepository,
} from "./read-listen.repository";
import {
	buildReadListenMatchProposal,
	type ReadListenMatchProposalView,
} from "./read-listen-match-view";
import {
	deriveMatchSearchQueries,
	READ_LISTEN_MATCHER_VERSION,
	READ_LISTEN_PROPOSAL_THRESHOLD,
	scoreReadListenMatch,
} from "./read-listen-matcher";

type ProposalGenerationStore = Pick<
	ReadListenRepository,
	| "getPublicationByUuid"
	| "listPublicationsByUuids"
	| "listPairRows"
	| "createMatchProposals"
	| "recordMatchEvaluation"
	| "listMatchProposalRows"
>;

type BookSearchPort = {
	searchBooks(request: SearchBooksRequest): Promise<SearchBooksResponse>;
};

export type GenerateReadListenProposalsInput = {
	audiobookUuid: string;
	limit: number;
	serverId: string;
	scope: LibraryScope;
};

/** Owns the complete discovery-to-persistence lifecycle for one audiobook. */
export class ReadListenProposalGeneration {
	constructor(
		private readonly store: ProposalGenerationStore = readListenRepository,
		private readonly search: BookSearchPort = {
			searchBooks: bookService.searchBooks,
		},
	) {}

	async generate(
		input: GenerateReadListenProposalsInput,
	): Promise<ReadListenMatchProposalView[]> {
		const audiobook = await this.store.getPublicationByUuid(
			input.audiobookUuid,
			input.serverId,
			input.scope,
		);
		if (!audiobook) throw new NotFoundError("Publication not found");
		if (audiobook.mediaType !== "audiobook") {
			throw new BadRequestError("Match proposals must start from an audiobook");
		}

		const searchQueries = [
			...new Set(
				[
					audiobook.title,
					audiobook.filename.replace(/\.[^.]+$/u, ""),
					...audiobook.series.map((item) => item.name),
				]
					.flatMap(deriveMatchSearchQueries)
					.map((query) => query.trim())
					.filter(Boolean),
			),
		].slice(0, 4);
		const searchResults = await Promise.all(
			searchQueries.map((query) =>
				this.search.searchBooks({
					query,
					limit: 30,
					serverId: input.serverId,
					accessibleLibraryIds: input.scope,
				}),
			),
		);
		const candidateUuids = [
			...new Set(
				searchResults.flatMap((result) => result.books.map((hit) => hit.uuid)),
			),
		];
		const candidates = await this.store.listPublicationsByUuids(
			candidateUuids,
			input.serverId,
			input.scope,
		);
		const pairedEbookIds = new Set(
			(await this.store.listPairRows(audiobook.id, input.serverId)).map(
				(row) => row.ebookBookId,
			),
		);
		const evaluated = candidates
			.filter(
				(candidate) =>
					candidate.mediaType === "ebook" && !pairedEbookIds.has(candidate.id),
			)
			.map((ebook) => ({
				ebook,
				result: scoreReadListenMatch(audiobook, ebook),
			}));
		const scored = evaluated
			.filter(
				({ result }) =>
					result.eligible && result.score >= READ_LISTEN_PROPOSAL_THRESHOLD,
			)
			.sort((left, right) => right.result.score - left.result.score)
			.slice(0, input.limit);
		const eligibleScores = evaluated
			.filter(({ result }) => result.eligible)
			.map(({ result }) => result.score);

		await this.store.createMatchProposals(
			scored.map(({ ebook, result }) => ({
				serverId: input.serverId,
				audiobookBookId: audiobook.id,
				ebookBookId: ebook.id,
				score: result.score,
				confidence: result.confidence,
				reasons: result.reasons,
				warnings: result.warnings,
				matcherVersion: READ_LISTEN_MATCHER_VERSION,
			})),
		);
		await this.store.recordMatchEvaluation({
			serverId: input.serverId,
			audiobookBookId: audiobook.id,
			matcherVersion: READ_LISTEN_MATCHER_VERSION,
			candidateCount: evaluated.length,
			proposalCount: scored.length,
			maxScore: eligibleScores.length ? Math.max(...eligibleScores) : null,
		});

		const rows = (
			await this.store.listMatchProposalRows(input.serverId, {
				status: "pending",
				audiobookBookId: audiobook.id,
				matcherVersion: READ_LISTEN_MATCHER_VERSION,
				limit: 50,
			})
		).slice(0, input.limit);
		const publications = new Map(
			[audiobook, ...candidates].map((publication) => [
				publication.id,
				publication,
			]),
		);
		return rows.flatMap((row) => {
			const view = buildReadListenMatchProposal(row, publications);
			return view ? [view] : [];
		});
	}
}

export const readListenProposalGeneration = new ReadListenProposalGeneration();
