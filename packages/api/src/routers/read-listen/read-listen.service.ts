import { BadRequestError, ConflictError, NotFoundError } from "../../errors";
import type {
	SearchAudiobooksRequest,
	SearchAudiobooksResponse,
	SearchBooksRequest,
	SearchBooksResponse,
} from "../../infrastructure/search/search.types";
import type { LibraryScope } from "../_shared/library-scope";
import * as audiobookService from "../audiobooks/audiobook.service";
import * as bookService from "../books/book.service";
import {
	type ExistingAlignmentImporter,
	type ExistingAlignmentImportResult,
	existingAlignmentImporter,
	readManagedAlignmentArtifact,
	readManagedAlignmentReport,
} from "./alignment-artifact";
import {
	type ReadListenAlignmentRow,
	type ReadListenGenerationRow,
	type ReadListenMatchProposalPageRow,
	type ReadListenMatchProposalRow,
	type ReadListenPairRow,
	type ReadListenPublication,
	type ReadListenRepository,
	readListenRepository,
} from "./read-listen.repository";
import {
	deriveMatchSearchQueries,
	READ_LISTEN_MATCHER_VERSION,
	READ_LISTEN_PROPOSAL_THRESHOLD,
	scoreReadListenMatch,
} from "./read-listen-matcher";
import {
	discoverTimedTextCandidates,
	resolveTimedTextSelection,
} from "./timed-text-candidates";
import {
	cleanupStagedTimedText,
	stageTimedTextUploads,
	type UploadedInput,
} from "./uploaded-alignment-input";

type ReadListenStore = Pick<
	ReadListenRepository,
	| "getPublicationByUuid"
	| "listPublicationsByIds"
	| "listPublicationsByUuids"
	| "listPairRows"
	| "listAllPairRows"
	| "getPairRow"
	| "listAlignmentRows"
	| "listLatestGenerationRows"
	| "getPairSources"
	| "upsertAlignment"
	| "createPair"
	| "deletePairAndMatchHistory"
	| "createMatchProposals"
	| "recordMatchEvaluation"
	| "listUnevaluatedCanonicalAudiobooks"
	| "listMatchProposalRows"
	| "listMatchProposalPage"
	| "getMatchProposalRow"
	| "decideMatchProposal"
>;

type SearchPort = {
	searchBooks(request: SearchBooksRequest): Promise<SearchBooksResponse>;
	searchAudiobooks(
		request: SearchAudiobooksRequest,
	): Promise<SearchAudiobooksResponse>;
};

export type ReadListenPairing = {
	id: string;
	createdAt: string;
	alignment: ReadListenAlignmentView;
	generation: ReadListenGenerationView | null;
	ebook: ReadListenPublicationView;
	audiobook: ReadListenPublicationView;
};

export type ReadListenGenerationView = Pick<
	ReadListenGenerationRow,
	| "taskId"
	| "status"
	| "provider"
	| "quality"
	| "error"
	| "createdAt"
	| "finishedAt"
>;

export type ReadListenAlignmentView =
	| { status: "not_imported" }
	| {
			status: "ready" | "stale";
			artifact: {
				generatorName: string;
				generatorVersion: string;
				origin: "external" | "honomiya" | null;
				generatedAt: string;
				cueCount: number;
				importedAt: string;
			};
	  };

export type ReadListenPublicationView = Omit<
	ReadListenPublication,
	"id" | "catalogHash"
>;

export type ReadListenMatchProposalView = {
	id: string;
	score: number;
	confidence: ReadListenMatchProposalRow["confidence"];
	reasons: string[];
	warnings: string[];
	matcherVersion: string;
	status: ReadListenMatchProposalRow["status"];
	createdAt: string;
	audiobook: ReadListenPublicationView;
	ebook: ReadListenPublicationView;
	decision: {
		action: "approve" | "reject" | "correct";
		selectedEbook: ReadListenPublicationView | null;
		pairUuid: string | null;
	} | null;
};

function toPublicationView(
	publication: ReadListenPublication,
): ReadListenPublicationView {
	const { catalogHash: _catalogHash, id: _id, ...view } = publication;
	return view;
}

function toAlignmentView(
	alignment: ReadListenAlignmentRow | undefined,
	ebook: ReadListenPublication,
	audiobook: ReadListenPublication,
): ReadListenAlignmentView {
	if (!alignment) return { status: "not_imported" };
	const stale =
		alignment.ebookCatalogHash !== ebook.catalogHash ||
		alignment.audiobookCatalogHash !== audiobook.catalogHash;
	return {
		status: stale ? "stale" : "ready",
		artifact: {
			generatorName: alignment.generatorName,
			generatorVersion: alignment.generatorVersion,
			origin: alignment.origin,
			generatedAt: alignment.generatedAt,
			cueCount: alignment.cueCount,
			importedAt: alignment.importedAt,
		},
	};
}

export class ReadListenService {
	constructor(
		private readonly store: ReadListenStore = readListenRepository,
		private readonly searchPort: SearchPort = {
			searchBooks: bookService.searchBooks,
			searchAudiobooks: audiobookService.searchAudiobooks,
		},
		private readonly alignmentImporter: Pick<
			ExistingAlignmentImporter,
			"import" | "importUploaded"
		> = existingAlignmentImporter,
		private readonly alignmentReader: {
			read: typeof readManagedAlignmentArtifact;
			readReport?: typeof readManagedAlignmentReport;
		} = {
			read: readManagedAlignmentArtifact,
			readReport: readManagedAlignmentReport,
		},
		private readonly generationPort: {
			enqueue(input: {
				pairUuid: string;
				serverId: string;
				requestedByUserId: string;
				ebookCatalogHash: string;
				audiobookCatalogHash: string;
				label: string;
				mode?: "provider" | "timed-text";
				timedTextPaths?: string[];
				verifyTimedText?: boolean;
			}): Promise<{ taskId: string; reused: boolean }>;
		} = {
			enqueue: async (input) =>
				(
					await import("./read-listen-generation")
				).readListenGenerationCoordinator.enqueue(input),
		},
	) {}

	private async requirePublication(
		uuid: string,
		serverId: string,
		scope: LibraryScope,
	): Promise<ReadListenPublication> {
		const publication = await this.store.getPublicationByUuid(
			uuid,
			serverId,
			scope,
		);
		if (!publication) throw new NotFoundError("Publication not found");
		return publication;
	}

	private async loadPairing(
		row: ReadListenPairRow,
		serverId: string,
		scope: LibraryScope,
		alignment?: ReadListenAlignmentRow,
		generation?: ReadListenGenerationRow,
	): Promise<ReadListenPairing | null> {
		const publications = await this.store.listPublicationsByIds(
			[row.ebookBookId, row.audiobookBookId],
			serverId,
			scope,
		);
		return this.buildPairing(
			row,
			new Map(publications.map((publication) => [publication.id, publication])),
			alignment,
			generation,
		);
	}

	private buildPairing(
		row: ReadListenPairRow,
		publications: Map<number, ReadListenPublication>,
		alignment?: ReadListenAlignmentRow,
		generation?: ReadListenGenerationRow,
	): ReadListenPairing | null {
		const ebook = publications.get(row.ebookBookId);
		const audiobook = publications.get(row.audiobookBookId);
		if (!ebook || !audiobook) return null;

		return {
			id: row.id,
			createdAt: row.createdAt,
			alignment: toAlignmentView(alignment, ebook, audiobook),
			generation: generation
				? {
						taskId: generation.taskId,
						status: generation.status,
						provider: generation.provider,
						quality: generation.quality,
						error: generation.error,
						createdAt: generation.createdAt,
						finishedAt: generation.finishedAt,
					}
				: null,
			ebook: toPublicationView(ebook),
			audiobook: toPublicationView(audiobook),
		};
	}

	private buildMatchProposal(
		row: ReadListenMatchProposalRow,
		publications: Map<number, ReadListenPublication>,
	): ReadListenMatchProposalView | null {
		const audiobook = publications.get(row.audiobookBookId);
		const ebook = publications.get(row.ebookBookId);
		if (
			!audiobook ||
			!ebook ||
			audiobook.mediaType !== "audiobook" ||
			ebook.mediaType !== "ebook"
		) {
			return null;
		}
		return {
			id: row.id,
			score: row.score,
			confidence: row.confidence,
			reasons: row.reasons,
			warnings: row.warnings,
			matcherVersion: row.matcherVersion,
			status: row.status,
			createdAt: row.createdAt,
			audiobook: toPublicationView(audiobook),
			ebook: toPublicationView(ebook),
			decision: null,
		};
	}

	private buildMatchProposalPageItem(
		row: ReadListenMatchProposalPageRow,
		publications: Map<number, ReadListenPublication>,
	): ReadListenMatchProposalView | null {
		const proposal = this.buildMatchProposal(row, publications);
		if (!proposal || !row.decisionAction) return proposal;
		const selectedEbook = row.selectedEbookBookId
			? publications.get(row.selectedEbookBookId)
			: undefined;
		if (
			row.selectedEbookBookId !== null &&
			selectedEbook?.mediaType !== "ebook"
		) {
			return null;
		}
		return {
			...proposal,
			decision: {
				action: row.decisionAction,
				selectedEbook:
					selectedEbook?.mediaType === "ebook"
						? toPublicationView(selectedEbook)
						: null,
				pairUuid: row.pairId,
			},
		};
	}

	async generateMatchProposals(input: {
		audiobookUuid: string;
		limit: number;
		serverId: string;
		scope: LibraryScope;
	}): Promise<ReadListenMatchProposalView[]> {
		const audiobook = await this.requirePublication(
			input.audiobookUuid,
			input.serverId,
			input.scope,
		);
		if (audiobook.mediaType !== "audiobook") {
			throw new BadRequestError("Match proposals must start from an audiobook");
		}

		const searchQuerySources = [
			audiobook.title,
			audiobook.filename.replace(/\.[^.]+$/u, ""),
			...audiobook.series.map((item) => item.name),
		];
		const searchQueries = [
			...new Set(
				searchQuerySources
					.flatMap(deriveMatchSearchQueries)
					.map((query) => query.trim())
					.filter(Boolean),
			),
		].slice(0, 4);
		const searchResults = await Promise.all(
			searchQueries.map((query) =>
				this.searchPort.searchBooks({
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
				({ result: match }) =>
					match.eligible && match.score >= READ_LISTEN_PROPOSAL_THRESHOLD,
			)
			.sort((left, right) => right.result.score - left.result.score)
			.slice(0, input.limit);
		const eligibleScores = evaluated
			.filter(({ result }) => result.eligible)
			.map(({ result }) => result.score);

		await this.store.createMatchProposals(
			scored.map(({ ebook, result: match }) => ({
				serverId: input.serverId,
				audiobookBookId: audiobook.id,
				ebookBookId: ebook.id,
				score: match.score,
				confidence: match.confidence,
				reasons: match.reasons,
				warnings: match.warnings,
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
			const view = this.buildMatchProposal(row, publications);
			return view ? [view] : [];
		});
	}

	async listMatchBatchCandidates(
		serverId: string,
		scope: LibraryScope,
		limit: number,
	): Promise<ReadListenPublicationView[]> {
		return (
			await this.store.listUnevaluatedCanonicalAudiobooks(
				serverId,
				scope,
				READ_LISTEN_MATCHER_VERSION,
				limit,
			)
		).map(toPublicationView);
	}

	async generateMatchProposalBatch(input: {
		audiobookUuids: string[];
		serverId: string;
		scope: LibraryScope;
	}) {
		let proposalCount = 0;
		for (const audiobookUuid of input.audiobookUuids) {
			const proposals = await this.generateMatchProposals({
				audiobookUuid,
				limit: 5,
				serverId: input.serverId,
				scope: input.scope,
			});
			proposalCount += proposals.length;
		}
		return {
			processedCount: input.audiobookUuids.length,
			proposalCount,
			matcherVersion: READ_LISTEN_MATCHER_VERSION,
		};
	}

	async listMatchProposals(input: {
		status: "pending" | "decided" | "superseded";
		offset: number;
		limit: number;
		serverId: string;
		scope: LibraryScope;
	}): Promise<ReadListenMatchProposalView[]> {
		const rows = (
			await this.store.listMatchProposalRows(input.serverId, {
				...input,
				matcherVersion:
					input.status === "pending" ? READ_LISTEN_MATCHER_VERSION : undefined,
			})
		).filter(
			(row) =>
				input.status !== "pending" ||
				row.matcherVersion === READ_LISTEN_MATCHER_VERSION,
		);
		const ids = [
			...new Set(rows.flatMap((row) => [row.audiobookBookId, row.ebookBookId])),
		];
		const publications = await this.store.listPublicationsByIds(
			ids,
			input.serverId,
			input.scope,
		);
		const byId = new Map(
			publications.map((publication) => [publication.id, publication]),
		);
		return rows.flatMap((row) => {
			const view = this.buildMatchProposal(row, byId);
			return view ? [view] : [];
		});
	}

	async listMatchProposalPage(input: {
		status: "pending" | "decided" | "superseded";
		query?: string;
		offset: number;
		limit: number;
		serverId: string;
		scope: LibraryScope;
	}): Promise<{ items: ReadListenMatchProposalView[]; total: number }> {
		const rows = await this.store.listMatchProposalPage(
			input.serverId,
			input.scope,
			{
				status: input.status,
				query: input.query,
				offset: input.offset,
				limit: input.limit,
				matcherVersion:
					input.status === "pending" ? READ_LISTEN_MATCHER_VERSION : undefined,
			},
		);
		const publicationIds = [
			...new Set(
				rows.flatMap((row) => [
					row.audiobookBookId,
					row.ebookBookId,
					...(row.selectedEbookBookId ? [row.selectedEbookBookId] : []),
				]),
			),
		];
		const publications = await this.store.listPublicationsByIds(
			publicationIds,
			input.serverId,
			input.scope,
		);
		const byId = new Map(
			publications.map((publication) => [publication.id, publication]),
		);
		return {
			items: rows.flatMap((row) => {
				const item = this.buildMatchProposalPageItem(row, byId);
				return item ? [item] : [];
			}),
			total: rows[0]?.totalCount ?? 0,
		};
	}

	async getMatchProposalForReview(
		proposalUuid: string,
		serverId: string,
		scope: LibraryScope,
	): Promise<ReadListenMatchProposalView> {
		const row = await this.store.getMatchProposalRow(proposalUuid, serverId);
		if (!row) throw new NotFoundError("Read & Listen match proposal not found");
		const publications = await this.store.listPublicationsByIds(
			[row.audiobookBookId, row.ebookBookId],
			serverId,
			scope,
		);
		const view = this.buildMatchProposal(
			row,
			new Map(publications.map((publication) => [publication.id, publication])),
		);
		if (!view)
			throw new NotFoundError("Read & Listen match proposal not found");
		return view;
	}

	async decideMatchProposal(input: {
		proposalUuid: string;
		action: "approve" | "reject" | "correct";
		selectedEbookUuid?: string;
		decidedByUserId: string;
		serverId: string;
		scope: LibraryScope;
	}) {
		const proposal = await this.store.getMatchProposalRow(
			input.proposalUuid,
			input.serverId,
		);
		if (!proposal)
			throw new NotFoundError("Read & Listen match proposal not found");
		if (proposal.status !== "pending") {
			throw new ConflictError(
				"Read & Listen match proposal was already decided",
			);
		}
		const proposalSources = await this.store.listPublicationsByIds(
			[proposal.audiobookBookId, proposal.ebookBookId],
			input.serverId,
			input.scope,
		);
		if (
			!this.buildMatchProposal(
				proposal,
				new Map(
					proposalSources.map((publication) => [publication.id, publication]),
				),
			)
		) {
			throw new NotFoundError("Read & Listen match proposal not found");
		}

		let selectedEbookBookId: number | null = null;
		if (input.action === "approve") selectedEbookBookId = proposal.ebookBookId;
		if (input.action === "correct") {
			if (!input.selectedEbookUuid) {
				throw new BadRequestError("A corrected proposal requires an ebook");
			}
			const selected = await this.requirePublication(
				input.selectedEbookUuid,
				input.serverId,
				input.scope,
			);
			if (selected.mediaType !== "ebook") {
				throw new BadRequestError("A corrected match must select an ebook");
			}
			if (selected.id === proposal.ebookBookId) {
				throw new BadRequestError(
					"Approve the proposal when the suggested ebook is correct",
				);
			}
			selectedEbookBookId = selected.id;
		}

		const outcome = await this.store.decideMatchProposal({
			proposal,
			action: input.action,
			selectedEbookBookId,
			decidedByUserId: input.decidedByUserId,
		});
		if (!outcome) {
			throw new ConflictError(
				"Read & Listen match proposal was already decided",
			);
		}
		return {
			decision: outcome.decision,
			pairUuid: outcome.pair?.id ?? null,
		};
	}

	async getPairings(
		publicationUuid: string,
		serverId: string,
		scope: LibraryScope,
	) {
		const publication = await this.requirePublication(
			publicationUuid,
			serverId,
			scope,
		);
		const rows = await this.store.listPairRows(publication.id, serverId);
		const pairIds = rows.map((row) => row.id);
		const publicationIds = [
			...new Set(rows.flatMap((row) => [row.ebookBookId, row.audiobookBookId])),
		];
		const [alignmentRows, generationRows, publications] = await Promise.all([
			this.store.listAlignmentRows(pairIds, serverId),
			this.store.listLatestGenerationRows(pairIds, serverId),
			this.store.listPublicationsByIds(publicationIds, serverId, scope),
		]);
		const alignments = new Map(
			alignmentRows.map((alignment) => [alignment.pairId, alignment]),
		);
		const generations = new Map(
			generationRows.map((generation) => [generation.pairId, generation]),
		);
		const publicationsById = new Map(
			publications.map((candidate) => [candidate.id, candidate]),
		);
		const pairings = rows.map((row) =>
			this.buildPairing(
				row,
				publicationsById,
				alignments.get(row.id),
				generations.get(row.id),
			),
		);
		return {
			publication: toPublicationView(publication),
			pairings: pairings.filter(
				(pairing): pairing is ReadListenPairing => pairing !== null,
			),
		};
	}

	async listPairings(
		serverId: string,
		scope: LibraryScope,
		page: { offset?: number; limit?: number } = {},
	) {
		const rows = await this.store.listAllPairRows(
			serverId,
			page.offset ?? 0,
			page.limit ?? 50,
		);
		const pairIds = rows.map((row) => row.id);
		const publicationIds = [
			...new Set(rows.flatMap((row) => [row.ebookBookId, row.audiobookBookId])),
		];
		const [alignmentRows, generationRows, publications] = await Promise.all([
			this.store.listAlignmentRows(pairIds, serverId),
			this.store.listLatestGenerationRows(pairIds, serverId),
			this.store.listPublicationsByIds(publicationIds, serverId, scope),
		]);
		const alignments = new Map(
			alignmentRows.map((alignment) => [alignment.pairId, alignment]),
		);
		const generations = new Map(
			generationRows.map((generation) => [generation.pairId, generation]),
		);
		const publicationsById = new Map(
			publications.map((publication) => [publication.id, publication]),
		);

		return rows
			.map((row) =>
				this.buildPairing(
					row,
					publicationsById,
					alignments.get(row.id),
					generations.get(row.id),
				),
			)
			.filter((pairing): pairing is ReadListenPairing => pairing !== null);
	}

	async searchPairings(input: {
		query: string;
		limit: number;
		serverId: string;
		scope: LibraryScope;
	}) {
		const normalizedQuery = input.query.toLocaleLowerCase();
		const pairings = await this.listPairings(input.serverId, input.scope, {
			limit: 200,
		});

		return pairings
			.filter((pairing) =>
				[
					pairing.ebook.title,
					pairing.ebook.filename,
					...pairing.ebook.authors.map((author) => author.name),
					pairing.audiobook.title,
					pairing.audiobook.filename,
					...pairing.audiobook.authors.map((author) => author.name),
					...pairing.audiobook.narrators.map((narrator) => narrator.name),
				]
					.join(" ")
					.toLocaleLowerCase()
					.includes(normalizedQuery),
			)
			.slice(0, input.limit)
			.map(({ id, ebook, audiobook }) => ({
				id,
				ebook: {
					uuid: ebook.uuid,
					title: ebook.title,
					filename: ebook.filename,
					cover: ebook.cover,
					authors: ebook.authors.map(({ name }) => ({ name })),
				},
				audiobook: {
					uuid: audiobook.uuid,
					title: audiobook.title,
					filename: audiobook.filename,
					cover: audiobook.cover,
					authors: audiobook.authors.map(({ name }) => ({ name })),
					narrators: audiobook.narrators.map(({ name }) => ({ name })),
				},
			}));
	}

	async searchCandidates(input: {
		publicationUuid: string;
		query: string;
		limit: number;
		serverId: string;
		scope: LibraryScope;
	}) {
		const publication = await this.requirePublication(
			input.publicationUuid,
			input.serverId,
			input.scope,
		);
		const request = {
			query: input.query,
			limit: input.limit,
			serverId: input.serverId,
			accessibleLibraryIds: input.scope,
		} as const;
		const searchResult =
			publication.mediaType === "ebook"
				? await this.searchPort.searchAudiobooks(request)
				: await this.searchPort.searchBooks(request);
		const hits =
			"audiobooks" in searchResult
				? searchResult.audiobooks
				: searchResult.books;
		const pairRows = await this.store.listPairRows(
			publication.id,
			input.serverId,
		);
		const pairedIds = new Set(
			pairRows.map((row) =>
				publication.mediaType === "ebook"
					? row.audiobookBookId
					: row.ebookBookId,
			),
		);
		const candidatesByUuid = new Map(
			(
				await this.store.listPublicationsByUuids(
					hits.map((hit) => hit.uuid),
					input.serverId,
					input.scope,
				)
			).map((candidate) => [candidate.uuid, candidate]),
		);
		const candidates = hits.map((hit) => {
			const candidate = candidatesByUuid.get(hit.uuid);
			return candidate
				? {
						...toPublicationView(candidate),
						isPaired: pairedIds.has(candidate.id),
					}
				: null;
		});

		return {
			publication: toPublicationView(publication),
			candidates: candidates.filter(
				(
					candidate,
				): candidate is ReadListenPublicationView & { isPaired: boolean } =>
					candidate !== null,
			),
			pagination: searchResult.pagination,
		};
	}

	async associate(input: {
		publicationUuid: string;
		candidateUuid: string;
		createdByUserId: string;
		serverId: string;
		scope: LibraryScope;
	}): Promise<ReadListenPairing> {
		if (input.publicationUuid === input.candidateUuid) {
			throw new BadRequestError("A publication cannot be paired with itself");
		}

		const [publication, candidate] = await Promise.all([
			this.requirePublication(
				input.publicationUuid,
				input.serverId,
				input.scope,
			),
			this.requirePublication(input.candidateUuid, input.serverId, input.scope),
		]);
		if (publication.mediaType === candidate.mediaType) {
			throw new BadRequestError(
				"A Read & Listen pair requires one ebook and one audiobook",
			);
		}

		const ebook = publication.mediaType === "ebook" ? publication : candidate;
		const audiobook =
			publication.mediaType === "audiobook" ? publication : candidate;
		const row = await this.store.createPair({
			serverId: input.serverId,
			ebookBookId: ebook.id,
			audiobookBookId: audiobook.id,
			createdByUserId: input.createdByUserId,
		});

		return {
			id: row.id,
			createdAt: row.createdAt,
			alignment: { status: "not_imported" },
			generation: null,
			ebook: toPublicationView(ebook),
			audiobook: toPublicationView(audiobook),
		};
	}

	async getPairForManagement(
		pairUuid: string,
		serverId: string,
		scope: LibraryScope,
	): Promise<ReadListenPairing> {
		const row = await this.store.getPairRow(pairUuid, serverId);
		if (!row) throw new NotFoundError("Read & Listen pair not found");
		const [[alignment], [generation]] = await Promise.all([
			this.store.listAlignmentRows([row.id], serverId),
			this.store.listLatestGenerationRows([row.id], serverId),
		]);
		const pair = await this.loadPairing(
			row,
			serverId,
			scope,
			alignment,
			generation,
		);
		if (!pair) throw new NotFoundError("Read & Listen pair not found");
		return pair;
	}

	async generateAlignment(
		pairUuid: string,
		requestedByUserId: string,
		serverId: string,
		scope: LibraryScope,
		options: {
			mode?: "provider" | "timed-text";
			timedTextFilenames?: string[];
			timedTextUploads?: UploadedInput[];
			verifyTimedText?: boolean;
		} = {},
	) {
		const row = await this.store.getPairRow(pairUuid, serverId);
		if (!row) throw new NotFoundError("Read & Listen pair not found");
		const sources = await this.store.getPairSources(row, serverId, scope);
		if (!sources) throw new NotFoundError("Publication source files not found");
		const pair = await this.loadPairing(row, serverId, scope);
		if (!pair) throw new NotFoundError("Read & Listen pair not found");

		const mode = options.mode ?? "provider";
		if (options.timedTextFilenames && options.timedTextUploads) {
			throw new BadRequestError(
				"Choose detected SRT files or upload SRT files, not both",
			);
		}
		let uploadedPaths: string[] | undefined;
		let timedTextPaths: string[] | undefined;
		if (mode === "timed-text") {
			if (options.timedTextUploads) {
				uploadedPaths = await stageTimedTextUploads(
					pairUuid,
					sources.audioPaths.length,
					options.timedTextUploads,
				);
				timedTextPaths = uploadedPaths;
			} else {
				timedTextPaths = await resolveTimedTextSelection(
					sources.audioPaths,
					options.timedTextFilenames ?? [],
				);
			}
		}

		try {
			const result = await this.generationPort.enqueue({
				pairUuid,
				serverId,
				requestedByUserId,
				ebookCatalogHash: sources.ebookCatalogHash,
				audiobookCatalogHash: sources.audiobookCatalogHash,
				label: `Generating alignment for ${pair.ebook.title}`,
				mode,
				...(mode === "timed-text"
					? { verifyTimedText: options.verifyTimedText === true }
					: {}),
				...(timedTextPaths ? { timedTextPaths } : {}),
			});
			if (uploadedPaths && result.reused) {
				await cleanupStagedTimedText(uploadedPaths);
			}
			return result;
		} catch (error) {
			if (uploadedPaths) await cleanupStagedTimedText(uploadedPaths);
			throw error;
		}
	}

	async getTimedTextCandidates(
		pairUuid: string,
		serverId: string,
		scope: LibraryScope,
	) {
		const row = await this.store.getPairRow(pairUuid, serverId);
		if (!row) throw new NotFoundError("Read & Listen pair not found");
		const sources = await this.store.getPairSources(row, serverId, scope);
		if (!sources) throw new NotFoundError("Publication source files not found");
		return { tracks: await discoverTimedTextCandidates(sources.audioPaths) };
	}

	async getAlignmentDiagnostics(
		pairUuid: string,
		serverId: string,
		scope: LibraryScope,
	) {
		const row = await this.store.getPairRow(pairUuid, serverId);
		if (!row) throw new NotFoundError("Read & Listen pair not found");
		const [alignment] = await this.store.listAlignmentRows([row.id], serverId);
		if (!alignment) throw new NotFoundError("Alignment not found");
		const pair = await this.loadPairing(row, serverId, scope, alignment);
		if (!pair) throw new NotFoundError("Read & Listen pair not found");
		if (!this.alignmentReader.readReport) return { report: null };
		return {
			report: await this.alignmentReader.readReport(alignment.artifactPath),
		};
	}

	async importExistingAlignment(
		pairUuid: string,
		serverId: string,
		scope: LibraryScope,
	) {
		const row = await this.store.getPairRow(pairUuid, serverId);
		if (!row) throw new NotFoundError("Read & Listen pair not found");
		const sources = await this.store.getPairSources(row, serverId, scope);
		if (!sources) throw new NotFoundError("Publication source files not found");

		const result = await this.alignmentImporter.import(pairUuid, sources);
		return this.finishAlignmentImport(result, row, sources, serverId, scope);
	}

	async importUploadedAlignment(
		pairUuid: string,
		serverId: string,
		scope: LibraryScope,
		bytes: Uint8Array,
		reportBytes?: Uint8Array,
	) {
		const row = await this.store.getPairRow(pairUuid, serverId);
		if (!row) throw new NotFoundError("Read & Listen pair not found");
		const sources = await this.store.getPairSources(row, serverId, scope);
		if (!sources) throw new NotFoundError("Publication source files not found");
		const result = await this.alignmentImporter.importUploaded(
			pairUuid,
			sources,
			bytes,
			reportBytes,
		);
		return this.finishAlignmentImport(result, row, sources, serverId, scope);
	}

	private async finishAlignmentImport(
		result: ExistingAlignmentImportResult,
		row: ReadListenPairRow,
		sources: NonNullable<
			Awaited<ReturnType<ReadListenRepository["getPairSources"]>>
		>,
		serverId: string,
		scope: LibraryScope,
	) {
		if (result.outcome === "imported") {
			const alignment = await this.store.upsertAlignment({
				pairId: row.id,
				...result.artifact,
				ebookCatalogHash: sources.ebookCatalogHash,
				audiobookCatalogHash: sources.audiobookCatalogHash,
			});
			const pairing = await this.loadPairing(row, serverId, scope, alignment);
			if (!pairing) throw new NotFoundError("Read & Listen pair not found");
			return { outcome: result.outcome, pairing };
		}

		const pairing = await this.getPairForManagement(row.id, serverId, scope);
		return { ...result, pairing };
	}

	async getSession(pairUuid: string, serverId: string, scope: LibraryScope) {
		const row = await this.store.getPairRow(pairUuid, serverId);
		if (!row) throw new NotFoundError("Read & Listen pair not found");
		const [alignment] = await this.store.listAlignmentRows([row.id], serverId);
		const pairing = await this.loadPairing(row, serverId, scope, alignment);
		if (!pairing) throw new NotFoundError("Read & Listen pair not found");
		if (!alignment || pairing.alignment.status !== "ready") {
			throw new ConflictError("Read & Listen alignment is not ready");
		}

		const manifest = await this.alignmentReader.read(
			alignment.artifactPath,
			alignment.artifactSha256,
		);
		return {
			pair: {
				id: pairing.id,
				ebookUuid: pairing.ebook.uuid,
				audiobookUuid: pairing.audiobook.uuid,
			},
			alignment: {
				schema: manifest.schema,
				createdAt: manifest.createdAt,
				generator: manifest.generator,
				granularity: manifest.granularity,
				audioFiles: manifest.sources.audioFiles.map(
					({ index, durationMs }) => ({ index, durationMs }),
				),
				cues: manifest.cues,
			},
		};
	}

	async removePair(
		pairUuid: string,
		serverId: string,
		scope: LibraryScope,
	): Promise<ReadListenPairing> {
		const pair = await this.getPairForManagement(pairUuid, serverId, scope);
		if (!(await this.store.deletePairAndMatchHistory(pairUuid, serverId))) {
			throw new NotFoundError("Read & Listen pair not found");
		}
		return pair;
	}
}

export const readListenService = new ReadListenService();
