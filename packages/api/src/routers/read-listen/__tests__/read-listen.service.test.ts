import { describe, expect, mock, test } from "bun:test";
import { BadRequestError, ConflictError } from "../../../errors";
import type {
	ReadListenAlignmentRow,
	ReadListenPairRow,
	ReadListenPublication,
} from "../read-listen.repository";
import { ReadListenService } from "../read-listen.service";

const ebook: ReadListenPublication = {
	id: 10,
	catalogHash: "s2:ebook",
	uuid: "00000000-0000-4000-8000-000000000010",
	mediaType: "ebook",
	filename: "book.epub",
	title: "The Book",
	cover: null,
	mainColor: null,
	languageCode: "en",
	duration: null,
	abridged: null,
	libraryUuid: "00000000-0000-4000-8000-000000000100",
	libraryName: "Books",
	authors: [{ name: "Author" }],
	narrators: [],
};

const audiobook: ReadListenPublication = {
	id: 20,
	catalogHash: "s2:audio",
	uuid: "00000000-0000-4000-8000-000000000020",
	mediaType: "audiobook",
	filename: "audio.m4b",
	title: "The Book",
	cover: null,
	mainColor: null,
	languageCode: "en",
	duration: 3600,
	abridged: false,
	libraryUuid: "00000000-0000-4000-8000-000000000200",
	libraryName: "Audiobooks",
	authors: [{ name: "Author" }],
	narrators: [{ name: "Narrator" }],
};

const pairRow: ReadListenPairRow = {
	id: "00000000-0000-4000-8000-000000000030",
	serverId: "server-1",
	ebookBookId: ebook.id,
	audiobookBookId: audiobook.id,
	createdByUserId: "user-1",
	createdAt: "2026-08-08T00:00:00.000Z",
	updatedAt: "2026-08-08T00:00:00.000Z",
};

const alignmentRow: ReadListenAlignmentRow = {
	id: "00000000-0000-4000-8000-000000000040",
	pairId: pairRow.id,
	artifactPath: "data/alignments/pair/artifact.json",
	artifactSha256: "c".repeat(64),
	sidecarSchema: "honomiya.read-listen.v1",
	generatorName: "honomiya",
	generatorVersion: "0.1.0",
	generatedAt: "2026-08-08T18:40:06.739Z",
	ebookSha256: "a".repeat(64),
	audioSha256: ["b".repeat(64)],
	ebookCatalogHash: ebook.catalogHash,
	audiobookCatalogHash: audiobook.catalogHash,
	cueCount: 5791,
	importedAt: "2026-08-08T20:00:00.000Z",
	updatedAt: "2026-08-08T20:00:00.000Z",
};

const alignmentManifest = {
	schema: "honomiya.read-listen.v1" as const,
	createdAt: "2026-08-08T18:40:06.739Z",
	generator: { name: "honomiya" as const, version: "0.1.0" },
	granularity: "sentence" as const,
	sources: {
		ebook: { sha256: "a".repeat(64), filename: "book.epub" },
		audioFiles: [
			{
				index: 0,
				sha256: "b".repeat(64),
				filename: "audio.m4b",
				durationMs: 10_000,
			},
		],
	},
	cues: [
		{
			id: "cue-1",
			text: {
				kind: "text-quote" as const,
				sectionRef: "chapter.xhtml",
				exact: "Sentence.",
			},
			audioFileIndex: 0,
			startMs: 100,
			endMs: 900,
		},
	],
};

function createHarness() {
	const publications = new Map([
		[ebook.uuid, ebook],
		[audiobook.uuid, audiobook],
	]);
	const byId = new Map([
		[ebook.id, ebook],
		[audiobook.id, audiobook],
	]);
	const store = {
		getPublicationByUuid: mock((uuid: string) =>
			Promise.resolve(publications.get(uuid) ?? null),
		),
		getPublicationById: mock((id: number) =>
			Promise.resolve(byId.get(id) ?? null),
		),
		listPublicationsByIds: mock((ids: number[]) =>
			Promise.resolve(
				ids.flatMap((id) => {
					const publication = byId.get(id);
					return publication ? [publication] : [];
				}),
			),
		),
		listPublicationsByUuids: mock((uuids: string[]) =>
			Promise.resolve(
				uuids.flatMap((uuid) => {
					const publication = publications.get(uuid);
					return publication ? [publication] : [];
				}),
			),
		),
		listPairRows: mock(() => Promise.resolve([] as ReadListenPairRow[])),
		listAllPairRows: mock(() => Promise.resolve([] as ReadListenPairRow[])),
		getPairRow: mock(() => Promise.resolve(pairRow)),
		listAlignmentRows: mock(() =>
			Promise.resolve([] as ReadListenAlignmentRow[]),
		),
		listLatestGenerationRows: mock(() => Promise.resolve([])),
		getPairSources: mock(() =>
			Promise.resolve({
				ebookPath: "/library/book.epub",
				audioPaths: ["/library/book.m4b"],
				ebookCatalogHash: ebook.catalogHash,
				audiobookCatalogHash: audiobook.catalogHash,
			}),
		),
		upsertAlignment: mock(() => Promise.resolve(alignmentRow)),
		createPair: mock(() => Promise.resolve(pairRow)),
		deletePair: mock(() => Promise.resolve(true)),
	};
	const searchPort = {
		searchBooks: mock(() =>
			Promise.resolve({
				books: [],
				pagination: {
					hasMore: false,
					totalHits: 0,
					totalHitsRelation: "eq" as const,
				},
			}),
		),
		searchAudiobooks: mock(() =>
			Promise.resolve({
				audiobooks: [{ uuid: audiobook.uuid }],
				pagination: { hasMore: false, totalHits: 1, totalHitsRelation: "eq" },
			} as never),
		),
	};
	const alignmentImporter = {
		import: mock(() =>
			Promise.resolve({
				outcome: "imported" as const,
				artifact: {
					artifactPath: alignmentRow.artifactPath,
					artifactSha256: alignmentRow.artifactSha256,
					sidecarSchema: "honomiya.read-listen.v1" as const,
					generatorName: "honomiya" as const,
					generatorVersion: alignmentRow.generatorVersion,
					generatedAt: alignmentRow.generatedAt,
					ebookSha256: alignmentRow.ebookSha256,
					audioSha256: alignmentRow.audioSha256,
					cueCount: alignmentRow.cueCount,
				},
			}),
		),
	};
	const alignmentReader = {
		read: mock(() => Promise.resolve(alignmentManifest)),
	};
	const generationPort = {
		enqueue: mock(() =>
			Promise.resolve({ taskId: "task-generation", reused: false }),
		),
	};
	return {
		store,
		searchPort,
		alignmentImporter,
		alignmentReader,
		generationPort,
		service: new ReadListenService(
			store,
			searchPort,
			alignmentImporter,
			alignmentReader,
			generationPort,
		),
	};
}

describe("ReadListenService", () => {
	test("lists only pairs whose two publications are in the caller scope", async () => {
		const { service, store } = createHarness();
		store.listAllPairRows.mockResolvedValue([pairRow]);
		store.listPublicationsByIds.mockResolvedValue([ebook]);

		const result = await service.listPairings("server-1", [1]);

		expect(result).toEqual([]);
		expect(store.listAllPairRows).toHaveBeenCalledWith("server-1", 0, 50);
	});

	test("canonicalizes the endpoints when association starts from an audiobook", async () => {
		const { service, store } = createHarness();

		const result = await service.associate({
			publicationUuid: audiobook.uuid,
			candidateUuid: ebook.uuid,
			createdByUserId: "user-1",
			serverId: "server-1",
			scope: "ALL",
		});

		expect(store.createPair).toHaveBeenCalledWith({
			serverId: "server-1",
			ebookBookId: ebook.id,
			audiobookBookId: audiobook.id,
			createdByUserId: "user-1",
		});
		expect(result.ebook.uuid).toBe(ebook.uuid);
		expect(result.audiobook.uuid).toBe(audiobook.uuid);
		expect(result.ebook).not.toHaveProperty("id");
		expect(result.audiobook).not.toHaveProperty("id");
	});

	test("rejects a pair whose publications have the same media type", async () => {
		const { service, store } = createHarness();
		const secondEbook = {
			...ebook,
			id: 11,
			uuid: "00000000-0000-4000-8000-000000000011",
		};
		store.getPublicationByUuid.mockImplementation((uuid: string) =>
			Promise.resolve(uuid === ebook.uuid ? ebook : secondEbook),
		);

		expect(
			service.associate({
				publicationUuid: ebook.uuid,
				candidateUuid: secondEbook.uuid,
				createdByUserId: "user-1",
				serverId: "server-1",
				scope: "ALL",
			}),
		).rejects.toBeInstanceOf(BadRequestError);
		expect(store.createPair).not.toHaveBeenCalled();
	});

	test("searches only the opposite media type and marks an existing pair", async () => {
		const { service, store, searchPort } = createHarness();
		store.listPairRows.mockResolvedValue([pairRow]);

		const result = await service.searchCandidates({
			publicationUuid: ebook.uuid,
			query: "The Book",
			limit: 8,
			serverId: "server-1",
			scope: [2],
		});

		expect(searchPort.searchAudiobooks).toHaveBeenCalledWith({
			query: "The Book",
			limit: 8,
			serverId: "server-1",
			accessibleLibraryIds: [2],
		});
		expect(searchPort.searchBooks).not.toHaveBeenCalled();
		expect(store.listPublicationsByUuids).toHaveBeenCalledWith(
			[audiobook.uuid],
			"server-1",
			[2],
		);
		expect(result.candidates).toEqual([
			expect.objectContaining({ uuid: audiobook.uuid, isPaired: true }),
		]);
		expect(result.publication).not.toHaveProperty("id");
		expect(result.candidates[0]).not.toHaveProperty("id");
	});

	test("does not expose a pair when either endpoint is outside the caller scope", async () => {
		const { service, store } = createHarness();
		store.listPairRows.mockResolvedValue([pairRow]);
		store.listPublicationsByIds.mockResolvedValue([ebook]);

		const result = await service.getPairings(ebook.uuid, "server-1", [1]);

		expect(result.pairings).toEqual([]);
		expect(store.listPublicationsByIds).toHaveBeenCalledTimes(1);
	});

	test("returns the removed pair so callers can update both publication views", async () => {
		const { service, store } = createHarness();

		const result = await service.removePair(pairRow.id, "server-1", "ALL");

		expect(store.deletePair).toHaveBeenCalledWith(pairRow.id, "server-1");
		expect(result.id).toBe(pairRow.id);
	});

	test("reports a source-verified imported alignment as ready", async () => {
		const { service, store } = createHarness();
		store.listPairRows.mockResolvedValue([pairRow]);
		store.listAlignmentRows.mockResolvedValue([alignmentRow]);

		const result = await service.getPairings(ebook.uuid, "server-1", "ALL");

		expect(result.pairings[0]?.alignment).toEqual({
			status: "ready",
			artifact: expect.objectContaining({ cueCount: 5791 }),
		});
	});

	test("marks an imported alignment stale when a catalog source changes", async () => {
		const { service, store } = createHarness();
		store.listPairRows.mockResolvedValue([pairRow]);
		store.listAlignmentRows.mockResolvedValue([
			{ ...alignmentRow, audiobookCatalogHash: "s2:replaced-audio" },
		]);

		const result = await service.getPairings(ebook.uuid, "server-1", "ALL");

		expect(result.pairings[0]?.alignment.status).toBe("stale");
	});

	test("imports an existing sidecar without exposing its filesystem path", async () => {
		const { service, store, alignmentImporter } = createHarness();

		const result = await service.importExistingAlignment(
			pairRow.id,
			"server-1",
			"ALL",
		);

		expect(alignmentImporter.import).toHaveBeenCalledWith(pairRow.id, {
			ebookPath: "/library/book.epub",
			audioPaths: ["/library/book.m4b"],
			ebookCatalogHash: ebook.catalogHash,
			audiobookCatalogHash: audiobook.catalogHash,
		});
		expect(store.upsertAlignment).toHaveBeenCalledTimes(1);
		expect(result.outcome).toBe("imported");
		expect(JSON.stringify(result)).not.toContain("data/alignments");
	});

	test("enqueues maximum-quality Modal generation from the verified pair sources", async () => {
		const { service, generationPort } = createHarness();

		const result = await service.generateAlignment(
			pairRow.id,
			"user-1",
			"server-1",
			"ALL",
		);

		expect(generationPort.enqueue).toHaveBeenCalledWith({
			pairUuid: pairRow.id,
			serverId: "server-1",
			requestedByUserId: "user-1",
			ebookCatalogHash: ebook.catalogHash,
			audiobookCatalogHash: audiobook.catalogHash,
			label: "Generating alignment for The Book",
		});
		expect(result).toEqual({ taskId: "task-generation", reused: false });
	});

	test("serves only reader-safe cues from a ready managed artifact", async () => {
		const { service, store, alignmentReader } = createHarness();
		store.listAlignmentRows.mockResolvedValue([alignmentRow]);

		const result = await service.getSession(pairRow.id, "server-1", "ALL");

		expect(alignmentReader.read).toHaveBeenCalledWith(
			alignmentRow.artifactPath,
			alignmentRow.artifactSha256,
		);
		expect(result.pair).toEqual({
			id: pairRow.id,
			ebookUuid: ebook.uuid,
			audiobookUuid: audiobook.uuid,
		});
		expect(result.alignment.cues).toHaveLength(1);
		expect(JSON.stringify(result)).not.toContain("sha256");
		expect(JSON.stringify(result)).not.toContain("filename");
		expect(JSON.stringify(result)).not.toContain("data/alignments");
	});

	test("refuses to serve a stale alignment to the reader", async () => {
		const { service, store, alignmentReader } = createHarness();
		store.listAlignmentRows.mockResolvedValue([
			{ ...alignmentRow, ebookCatalogHash: "s2:changed" },
		]);

		expect(
			service.getSession(pairRow.id, "server-1", "ALL"),
		).rejects.toBeInstanceOf(ConflictError);
		expect(alignmentReader.read).not.toHaveBeenCalled();
	});
});
