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
	existingAlignmentImporter,
	readManagedAlignmentArtifact,
} from "./alignment-artifact";
import {
	type ReadListenAlignmentRow,
	type ReadListenGenerationRow,
	type ReadListenPairRow,
	type ReadListenPublication,
	type ReadListenRepository,
	readListenRepository,
} from "./read-listen.repository";

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
	| "deletePair"
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
	"taskId" | "status" | "provider" | "quality" | "createdAt" | "finishedAt"
>;

export type ReadListenAlignmentView =
	| { status: "not_imported" }
	| {
			status: "ready" | "stale";
			artifact: {
				generatorName: string;
				generatorVersion: string;
				generatedAt: string;
				cueCount: number;
				importedAt: string;
			};
	  };

export type ReadListenPublicationView = Omit<
	ReadListenPublication,
	"id" | "catalogHash"
>;

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
			"import"
		> = existingAlignmentImporter,
		private readonly alignmentReader: {
			read: typeof readManagedAlignmentArtifact;
		} = { read: readManagedAlignmentArtifact },
		private readonly generationPort: {
			enqueue(input: {
				pairUuid: string;
				serverId: string;
				requestedByUserId: string;
				ebookCatalogHash: string;
				audiobookCatalogHash: string;
				label: string;
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
						createdAt: generation.createdAt,
						finishedAt: generation.finishedAt,
					}
				: null,
			ebook: toPublicationView(ebook),
			audiobook: toPublicationView(audiobook),
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

	async listPairings(serverId: string, scope: LibraryScope) {
		const rows = await this.store.listAllPairRows(serverId);
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
		const pairings = await this.listPairings(input.serverId, input.scope);

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
	) {
		const row = await this.store.getPairRow(pairUuid, serverId);
		if (!row) throw new NotFoundError("Read & Listen pair not found");
		const sources = await this.store.getPairSources(row, serverId, scope);
		if (!sources) throw new NotFoundError("Publication source files not found");
		const pair = await this.loadPairing(row, serverId, scope);
		if (!pair) throw new NotFoundError("Read & Listen pair not found");

		return this.generationPort.enqueue({
			pairUuid,
			serverId,
			requestedByUserId,
			ebookCatalogHash: sources.ebookCatalogHash,
			audiobookCatalogHash: sources.audiobookCatalogHash,
			label: `Generating alignment for ${pair.ebook.title}`,
		});
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
		if (result.outcome === "imported") {
			const alignment = await this.store.upsertAlignment({
				pairId: pairUuid,
				...result.artifact,
				ebookCatalogHash: sources.ebookCatalogHash,
				audiobookCatalogHash: sources.audiobookCatalogHash,
			});
			const pairing = await this.loadPairing(row, serverId, scope, alignment);
			if (!pairing) throw new NotFoundError("Read & Listen pair not found");
			return { outcome: result.outcome, pairing };
		}

		const pairing = await this.getPairForManagement(pairUuid, serverId, scope);
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
		if (!(await this.store.deletePair(pairUuid, serverId))) {
			throw new NotFoundError("Read & Listen pair not found");
		}
		return pair;
	}
}

export const readListenService = new ReadListenService();
