import {
	afterAll,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";

// ─── Mocks (queues/repository — avoid Redis & Postgres) ─────────────

mock.module(
	"../../../../infrastructure/queue/queues/cover-ingest.queue",
	() => ({
		coverIngestQueue: { add: mock(() => Promise.resolve()) },
	}),
);

const mockMergeFieldSources = mock(() => Promise.resolve());
const mockGetLibraryProviderOrder = mock(() =>
	Promise.resolve(null as string[] | null),
);
const mockGetLibraryMetadataConfig = mock(() =>
	Promise.resolve(
		null as {
			amazon?: { domain?: string };
			audible?: { region?: string };
		} | null,
	),
);
const mockUpsertMetadata = mock(() => Promise.resolve({ bookId: 1 }));
const mockReplaceChapters = mock(() => Promise.resolve());
const mockUpsertTagsAndLink = mock(() => Promise.resolve());
const mockGetLockedFields = mock(() => Promise.resolve([] as string[]));
const mockGetCoverByBookId = mock(() => Promise.resolve(null as string | null));
const mockSetLockedFields = mock(() => Promise.resolve());
const mockAddLockedFields = mock(() => Promise.resolve());
const mockRemoveLockedFields = mock(() => Promise.resolve());
const mockSaveOriginalMetadata = mock(() => Promise.resolve(null));
const mockGetOriginalMetadata = mock(() => Promise.resolve(null));

const repositoryMock = {
	saveOriginalMetadata: mockSaveOriginalMetadata,
	getOriginalMetadata: mockGetOriginalMetadata,
	getLockedFields: mockGetLockedFields,
	getCoverByBookId: mockGetCoverByBookId,
	setLockedFields: mockSetLockedFields,
	addLockedFields: mockAddLockedFields,
	removeLockedFields: mockRemoveLockedFields,
	mergeFieldSources: mockMergeFieldSources,
	getLibraryProviderOrder: mockGetLibraryProviderOrder,
	getLibraryMetadataConfig: mockGetLibraryMetadataConfig,
	getServerIdByBookId: mock(() => Promise.resolve("server-1")),
	upsertMetadata: mockUpsertMetadata,
	upsertPublisher: mock(() => Promise.resolve(1)),
	upsertSeries: mock(() => Promise.resolve(1)),
	getBookSeriesIds: mock(() => Promise.resolve([])),
	clearBookSeries: mock(() => Promise.resolve()),
	linkBookSeries: mock(() => Promise.resolve()),
	deleteSeriesIfOrphaned: mock(() => Promise.resolve()),
	getBookAuthors: mock(() => Promise.resolve([])),
	clearBookAuthors: mock(() => Promise.resolve()),
	upsertAuthor: mock(() => Promise.resolve(1)),
	linkBookAuthor: mock(() => Promise.resolve()),
	deleteAuthorIfOrphaned: mock(() => Promise.resolve()),
	getBookNarrators: mock(() => Promise.resolve([])),
	clearBookNarrators: mock(() => Promise.resolve()),
	upsertNarrator: mock(() => Promise.resolve(1)),
	linkBookNarrator: mock(() => Promise.resolve()),
	deleteNarratorIfOrphaned: mock(() => Promise.resolve()),
	upsertGenre: mock(() => Promise.resolve(1)),
	linkBookGenre: mock(() => Promise.resolve()),
	clearBookGenres: mock(() => Promise.resolve()),
	upsertTagsAndLink: mockUpsertTagsAndLink,
	clearBookTags: mock(() => Promise.resolve()),
	replaceChapters: mockReplaceChapters,
	resetMetadata: mock(() => Promise.resolve()),
	resolveInferredSeries: mock((name: string) =>
		Promise.resolve({ id: 1, name }),
	),
};

mock.module("../metadata.repository", () => ({
	audiobookMetadataRepository: repositoryMock,
}));

const { audiobookMetadataService, cleanVolumeNoise, matchConfidence } =
	await import("../metadata.service");
const { enrichmentStateRepository } = await import(
	"../../../enrichment/enrichment.repository"
);

// Patch the state-repo singleton in place (spyOn + restore in afterAll-safe
// pattern) — mock.module would leak into the repository's own tests.
const mockStateIsTerminal = spyOn(
	enrichmentStateRepository,
	"isTerminal",
).mockImplementation(() => Promise.resolve(false));
const mockRecordRun = spyOn(
	enrichmentStateRepository,
	"recordRun",
).mockImplementation(() => Promise.resolve());
const mockGetEnrichmentState = spyOn(
	enrichmentStateRepository,
	"get",
).mockImplementation(() => Promise.resolve(null));
const mockRecordPartialMatch = spyOn(
	enrichmentStateRepository,
	"recordPartialMatch",
).mockImplementation(() => Promise.resolve());
const mockRecordFailures = spyOn(
	enrichmentStateRepository,
	"recordFailures",
).mockImplementation(() => Promise.resolve());
const mockResetForRetry = spyOn(
	enrichmentStateRepository,
	"resetForRetry",
).mockImplementation(() => Promise.resolve());
const { CatalogProviderError } = await import(
	"../../../../modules/catalogEnrichment"
);
const { audibleProvider } = await import("../providers/audible.provider");
const { itunesProvider } = await import("../providers/itunes.provider");

// Spy on the provider singletons instead of mocking their modules so other
// test files keep the real modules in the shared bun process.
const audibleSearchSpy = spyOn(audibleProvider, "search");
const audibleGetByIdSpy = spyOn(audibleProvider, "getById");
const audibleChaptersSpy = spyOn(audibleProvider, "getChapters");
const itunesSearchSpy = spyOn(itunesProvider, "search");
const itunesGetByIdSpy = spyOn(itunesProvider, "getById");

afterAll(() => {
	audibleSearchSpy.mockRestore();
	audibleGetByIdSpy.mockRestore();
	audibleChaptersSpy.mockRestore();
	itunesSearchSpy.mockRestore();
	itunesGetByIdSpy.mockRestore();
	mockGetEnrichmentState.mockRestore();
	mockResetForRetry.mockRestore();
});

const BASE_INPUT = { bookId: 1, uuid: "uuid-1", title: "Great Story" };

const AUDIBLE_CANDIDATE = {
	provider: "audible" as const,
	providerId: "B0ASIN",
	title: "Great Story",
	asin: "B0ASIN",
};

const ITUNES_CANDIDATE = {
	provider: "itunes" as const,
	providerId: "12345",
	title: "Great Story",
};

const AUDIBLE_FULL = {
	title: "Great Story",
	asin: "B0ASIN",
	description: "audible desc",
	duration: 3600,
	authors: [{ name: "Audible Author", role: "Author" }],
	narrators: [{ name: "Narrator N" }],
	publisher: { name: "Pub" },
	series: { name: "Great Series", position: 1 },
	genres: ["Fantasy"],
	cover: "data/covers/uuid-1.webp",
	languageCode: "en",
	publishedDate: "2024-01-01",
	subtitle: "sub",
	isbn: "9780000000000",
	abridged: false,
	audibleRating: 4.5,
};

const CHAPTERS = {
	chapters: [
		{ title: "Ch 1", startTime: 0, endTime: 100 },
		{ title: "Ch 2", startTime: 100, endTime: 200 },
	],
};

const { providerGate } = await import(
	"../../../../infrastructure/providerGate"
);

beforeEach(() => {
	providerGate.clearAllInMemory();
	audibleSearchSpy.mockReset();
	audibleGetByIdSpy.mockReset();
	audibleChaptersSpy.mockReset();
	itunesSearchSpy.mockReset();
	itunesGetByIdSpy.mockReset();
	mockStateIsTerminal.mockReset();
	mockStateIsTerminal.mockImplementation(() => Promise.resolve(false));
	mockRecordRun.mockClear();
	mockGetEnrichmentState.mockReset();
	mockGetEnrichmentState.mockImplementation(() => Promise.resolve(null));
	mockRecordPartialMatch.mockClear();
	mockRecordFailures.mockClear();
	mockMergeFieldSources.mockClear();
	mockUpsertMetadata.mockClear();
	mockReplaceChapters.mockClear();
	mockUpsertTagsAndLink.mockClear();
	mockGetLockedFields.mockReset();
	mockGetCoverByBookId.mockReset();
	mockSetLockedFields.mockClear();
	mockAddLockedFields.mockClear();
	mockRemoveLockedFields.mockClear();
	mockSaveOriginalMetadata.mockClear();
	mockGetOriginalMetadata.mockReset();
	mockGetOriginalMetadata.mockImplementation(() => Promise.resolve(null));
	mockResetForRetry.mockClear();
	repositoryMock.upsertNarrator.mockClear();
	repositoryMock.clearBookNarrators.mockClear();
	repositoryMock.clearBookAuthors.mockClear();
	repositoryMock.upsertGenre.mockClear();
	repositoryMock.clearBookGenres.mockClear();
	repositoryMock.clearBookTags.mockClear();
	repositoryMock.upsertPublisher.mockClear();
	mockGetLibraryProviderOrder.mockReset();
	mockGetLibraryMetadataConfig.mockReset();

	mockGetLockedFields.mockImplementation(() => Promise.resolve([]));
	mockGetCoverByBookId.mockImplementation(() => Promise.resolve(null));

	mockGetLibraryProviderOrder.mockImplementation(() => Promise.resolve(null));
	mockGetLibraryMetadataConfig.mockImplementation(() => Promise.resolve(null));
	audibleSearchSpy.mockImplementation(async () => []);
	audibleGetByIdSpy.mockImplementation(async () => null);
	audibleChaptersSpy.mockImplementation(async () => null);
	itunesSearchSpy.mockImplementation(async () => []);
	itunesGetByIdSpy.mockImplementation(async () => null);
});

describe("quickMatch provider chain", () => {
	test("does not rewrite the acquired cover path while cover ingest can replace it", async () => {
		mockGetCoverByBookId.mockImplementation(async () =>
			Promise.resolve("data/covers/uuid-1.jpg"),
		);
		audibleSearchSpy.mockImplementation(async () => [AUDIBLE_CANDIDATE]);
		audibleGetByIdSpy.mockImplementation(async () => AUDIBLE_FULL);

		await audiobookMetadataService.quickMatch({ ...BASE_INPUT });

		const savedArg = mockUpsertMetadata.mock.calls[0] as unknown as [
			number,
			Record<string, unknown>,
		];
		expect(savedArg[1].cover).toBeUndefined();
		expect(audibleGetByIdSpy).toHaveBeenCalledWith("B0ASIN", {
			region: "us",
			bookUuid: undefined,
		});
	});

	test("audible confident match wins the record and chapters; itunes skipped when nothing is missing", async () => {
		audibleSearchSpy.mockImplementation(async () => [AUDIBLE_CANDIDATE]);
		audibleGetByIdSpy.mockImplementation(async () => AUDIBLE_FULL);
		audibleChaptersSpy.mockImplementation(async () => CHAPTERS);

		const result = await audiobookMetadataService.quickMatch({ ...BASE_INPUT });

		expect(result).toEqual({ bookId: 1 });
		expect(audibleGetByIdSpy).toHaveBeenCalledWith("B0ASIN", {
			region: "us",
			bookUuid: "uuid-1",
		});
		expect(mockReplaceChapters).toHaveBeenCalledWith(1, [
			{ index: 0, title: "Ch 1", startTime: 0, endTime: 100 },
			{ index: 1, title: "Ch 2", startTime: 100, endTime: 200 },
		]);
		expect(mockRecordRun).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				status: "enriched",
				matched: expect.arrayContaining([
					expect.objectContaining({ provider: "audible" }),
				]),
			}),
		);
		// Audible filled every itunes-fillable field → itunes never consulted.
		expect(itunesSearchSpy).not.toHaveBeenCalled();
	});

	test("itunes fills fields still missing after the audible match", async () => {
		audibleSearchSpy.mockImplementation(async () => [AUDIBLE_CANDIDATE]);
		// Audible match without description/genres → itunes can still contribute.
		audibleGetByIdSpy.mockImplementation(async () => ({
			title: "Great Story",
			asin: "B0ASIN",
			duration: 3600,
			authors: [{ name: "Audible Author", role: "Author" }],
			narrators: [{ name: "Narrator N" }],
			cover: "data/covers/uuid-1.webp",
			publishedDate: "2024-01-01",
			languageCode: "en",
			subtitle: "sub",
			isbn: "x",
			abridged: false,
			publisher: { name: "Pub" },
			series: { name: "S" },
			audibleRating: 4,
		}));
		itunesSearchSpy.mockImplementation(async () => [ITUNES_CANDIDATE]);
		itunesGetByIdSpy.mockImplementation(async () => ({
			title: "Great Story",
			description: "itunes desc",
			genres: ["Fiction"],
			authors: [{ name: "iTunes Author", role: "Author" }],
		}));

		await audiobookMetadataService.quickMatch({ ...BASE_INPUT });

		const savedArg = mockUpsertMetadata.mock.calls[0] as unknown as [
			number,
			Record<string, unknown>,
		];
		expect(savedArg[1].description).toBe("itunes desc");
		// Secondary provider must NOT override the primary's authors.
		expect(mockRecordRun).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				status: "enriched",
				matched: expect.arrayContaining([
					expect.objectContaining({ provider: "audible" }),
				]),
			}),
		);
	});

	test("audible tags are persisted via upsertTagsAndLink", async () => {
		audibleSearchSpy.mockImplementation(async () => [AUDIBLE_CANDIDATE]);
		audibleGetByIdSpy.mockImplementation(async () => ({
			...AUDIBLE_FULL,
			tags: ["Isekai", "LitRPG"],
		}));
		audibleChaptersSpy.mockImplementation(async () => CHAPTERS);

		await audiobookMetadataService.quickMatch({ ...BASE_INPUT });

		expect(mockUpsertTagsAndLink).toHaveBeenCalledWith(
			1,
			["Isekai", "LitRPG"],
			"server-1",
		);
	});

	test("audible no match → itunes becomes primary, no chapters call", async () => {
		audibleSearchSpy.mockImplementation(async () => []);
		itunesSearchSpy.mockImplementation(async () => [ITUNES_CANDIDATE]);
		itunesGetByIdSpy.mockImplementation(async () => ({
			title: "Great Story",
			description: "itunes desc",
		}));

		const result = await audiobookMetadataService.quickMatch({ ...BASE_INPUT });

		expect(result).toEqual({ bookId: 1 });
		// iTunes match had no authors → recorded as a retryable partial.
		expect(mockRecordPartialMatch).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				matched: expect.arrayContaining([
					expect.objectContaining({ provider: "itunes" }),
				]),
			}),
		);
		expect(mockRecordRun).not.toHaveBeenCalled();
		expect(mockReplaceChapters).not.toHaveBeenCalled();
	});

	test("itunes match WITH authors is marked complete", async () => {
		audibleSearchSpy.mockImplementation(async () => []);
		itunesSearchSpy.mockImplementation(async () => [ITUNES_CANDIDATE]);
		itunesGetByIdSpy.mockImplementation(async () => ({
			title: "Great Story",
			authors: [{ name: "iTunes Author", role: "Author" }],
		}));

		await audiobookMetadataService.quickMatch({ ...BASE_INPUT });

		expect(mockRecordRun).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				status: "enriched",
				matched: expect.arrayContaining([
					expect.objectContaining({ provider: "itunes" }),
				]),
			}),
		);
	});

	test("no provider matches → markEnriched(null), nothing saved", async () => {
		const result = await audiobookMetadataService.quickMatch({ ...BASE_INPUT });

		expect(result).toBeNull();
		expect(mockRecordRun).toHaveBeenCalledWith(
			1,
			expect.objectContaining({ status: "no_match" }),
		);
		expect(mockUpsertMetadata).not.toHaveBeenCalled();
	});

	test("two valid audiobook candidates stay unresolved without metadata", async () => {
		audibleSearchSpy.mockImplementation(async () => [
			{ ...AUDIBLE_CANDIDATE, providerId: "B0FIRST001" },
			{ ...AUDIBLE_CANDIDATE, providerId: "B0SECOND01" },
		]);
		audibleGetByIdSpy.mockImplementation(async (providerId) => ({
			...AUDIBLE_FULL,
			asin: providerId,
		}));

		const result = await audiobookMetadataService.quickMatch({ ...BASE_INPUT });

		expect(result).toBeNull();
		expect(mockUpsertMetadata).not.toHaveBeenCalled();
		expect(mockReplaceChapters).not.toHaveBeenCalled();
		expect(mockRecordRun).toHaveBeenCalledWith(1, {
			status: "no_match",
			failures: [],
			decision: {
				kind: "ambiguous",
				candidates: [
					expect.objectContaining({
						provider: "audible",
						providerId: "B0FIRST001",
					}),
					expect.objectContaining({
						provider: "audible",
						providerId: "B0SECOND01",
					}),
				],
			},
		});
	});

	test("low-similarity candidates are rejected", async () => {
		audibleSearchSpy.mockImplementation(async () => [
			{ ...AUDIBLE_CANDIDATE, title: "Completely Different Book" },
		]);

		const result = await audiobookMetadataService.quickMatch({ ...BASE_INPUT });

		expect(result).toBeNull();
		expect(audibleGetByIdSpy).not.toHaveBeenCalled();
	});

	test("tries the next ranked candidate when hydration reveals a different audiobook", async () => {
		audibleSearchSpy.mockImplementation(async () => [
			{ ...AUDIBLE_CANDIDATE, providerId: "B0WRONG001" },
			{ ...AUDIBLE_CANDIDATE, providerId: "B0RIGHT001" },
		]);
		audibleGetByIdSpy.mockImplementation(async (providerId) =>
			providerId === "B0WRONG001"
				? { title: "Completely Different Book" }
				: AUDIBLE_FULL,
		);

		const result = await audiobookMetadataService.quickMatch({ ...BASE_INPUT });

		expect(result).toEqual({ bookId: 1 });
		expect(mockRecordRun).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				status: "enriched",
				matched: expect.arrayContaining([
					expect.objectContaining({ provider: "audible" }),
				]),
			}),
		);
	});

	test("library provider order is respected", async () => {
		mockGetLibraryProviderOrder.mockImplementation(() =>
			Promise.resolve(["itunes", "audible"]),
		);
		const calls: string[] = [];
		audibleSearchSpy.mockImplementation(async () => {
			calls.push("audible");
			return [];
		});
		itunesSearchSpy.mockImplementation(async () => {
			calls.push("itunes");
			return [ITUNES_CANDIDATE];
		});
		itunesGetByIdSpy.mockImplementation(async () => ({
			title: "Great Story",
		}));

		await audiobookMetadataService.quickMatch({ ...BASE_INPUT });

		expect(calls[0]).toBe("itunes");
		expect(mockRecordPartialMatch).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				matched: expect.arrayContaining([
					expect.objectContaining({ provider: "itunes" }),
				]),
			}),
		);
		expect(mockRecordRun).not.toHaveBeenCalled();
	});

	test("itunes-only order never touches audible", async () => {
		mockGetLibraryProviderOrder.mockImplementation(() =>
			Promise.resolve(["itunes"]),
		);
		itunesSearchSpy.mockImplementation(async () => [ITUNES_CANDIDATE]);
		itunesGetByIdSpy.mockImplementation(async () => ({
			title: "Great Story",
		}));

		await audiobookMetadataService.quickMatch({ ...BASE_INPUT });

		expect(audibleSearchSpy).not.toHaveBeenCalled();
	});

	test("stale ebook provider ids fall back to the default order", async () => {
		mockGetLibraryProviderOrder.mockImplementation(() =>
			Promise.resolve(["ranobedb", "amazon"]),
		);
		audibleSearchSpy.mockImplementation(async () => [AUDIBLE_CANDIDATE]);
		audibleGetByIdSpy.mockImplementation(async () => AUDIBLE_FULL);
		audibleChaptersSpy.mockImplementation(async () => null);

		await audiobookMetadataService.quickMatch({ ...BASE_INPUT });

		expect(audibleSearchSpy).toHaveBeenCalled();
		expect(mockRecordRun).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				status: "enriched",
				matched: expect.arrayContaining([
					expect.objectContaining({ provider: "audible" }),
				]),
			}),
		);
	});

	test("library audible region reaches provider calls", async () => {
		mockGetLibraryMetadataConfig.mockImplementation(() =>
			Promise.resolve({ audible: { region: "jp" } }),
		);
		audibleSearchSpy.mockImplementation(async () => [AUDIBLE_CANDIDATE]);
		audibleGetByIdSpy.mockImplementation(async () => AUDIBLE_FULL);
		audibleChaptersSpy.mockImplementation(async () => null);

		await audiobookMetadataService.quickMatch({ ...BASE_INPUT });

		expect(audibleSearchSpy).toHaveBeenCalledWith(
			{ title: "Great Story", authors: undefined },
			{ region: "jp" },
		);
		expect(audibleGetByIdSpy).toHaveBeenCalledWith("B0ASIN", {
			region: "jp",
			bookUuid: "uuid-1",
		});
	});

	test("already enriched → returns null without provider calls", async () => {
		mockStateIsTerminal.mockImplementation(() => Promise.resolve(true));

		const result = await audiobookMetadataService.quickMatch({ ...BASE_INPUT });

		expect(result).toBeNull();
		expect(audibleSearchSpy).not.toHaveBeenCalled();
		expect(itunesSearchSpy).not.toHaveBeenCalled();
	});

	test("a refresh hydrates the manually selected audiobook identity only", async () => {
		mockGetEnrichmentState.mockImplementation(async () =>
			Promise.resolve({
				matched: [
					{
						provider: "audible",
						providerId: "B0MANUAL01",
						manual: true,
					},
				],
			} as Awaited<ReturnType<typeof enrichmentStateRepository.get>>),
		);
		audibleSearchSpy.mockImplementation(async () => [
			{ ...AUDIBLE_CANDIDATE, providerId: "B0RIVAL001" },
		]);
		audibleGetByIdSpy.mockImplementation(async () => AUDIBLE_FULL);

		const result = await audiobookMetadataService.quickMatch({ ...BASE_INPUT });

		expect(result).toEqual({ bookId: 1 });
		expect(audibleSearchSpy).not.toHaveBeenCalled();
		expect(audibleGetByIdSpy).toHaveBeenCalledWith("B0MANUAL01", {
			region: "us",
			bookUuid: "uuid-1",
		});
	});

	test("tag ASIN goes straight to getById — no catalog search", async () => {
		audibleGetByIdSpy.mockImplementation(async () => AUDIBLE_FULL);
		audibleChaptersSpy.mockImplementation(async () => CHAPTERS);

		const result = await audiobookMetadataService.quickMatch({
			...BASE_INPUT,
			asin: "b0asin1234",
		});

		expect(result).toEqual({ bookId: 1 });
		expect(audibleGetByIdSpy).toHaveBeenCalledWith("B0ASIN1234", {
			region: "us",
			bookUuid: "uuid-1",
		});
		expect(audibleSearchSpy).not.toHaveBeenCalled();
		expect(mockRecordRun).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				status: "enriched",
				matched: expect.arrayContaining([
					expect.objectContaining({ provider: "audible" }),
				]),
			}),
		);
		expect(mockReplaceChapters).toHaveBeenCalled();
	});

	test("missing tag ASIN falls back to catalog discovery", async () => {
		audibleSearchSpy.mockImplementation(async () => [AUDIBLE_CANDIDATE]);
		audibleGetByIdSpy.mockImplementation(async (providerId) =>
			providerId === "B0MISS0001" ? null : AUDIBLE_FULL,
		);

		const result = await audiobookMetadataService.quickMatch({
			...BASE_INPUT,
			asin: "B0MISS0001",
		});

		expect(result).toEqual({ bookId: 1 });
		expect(audibleSearchSpy).toHaveBeenCalledWith(
			{ title: "Great Story", authors: undefined },
			{ region: "us" },
		);
		expect(audibleGetByIdSpy).toHaveBeenCalledTimes(2);
	});

	test("invalid tag ASIN falls back to the normal search chain", async () => {
		audibleSearchSpy.mockImplementation(async () => [AUDIBLE_CANDIDATE]);
		audibleGetByIdSpy.mockImplementation(async () => AUDIBLE_FULL);

		await audiobookMetadataService.quickMatch({
			...BASE_INPUT,
			asin: "not-an-asin",
		});

		expect(audibleSearchSpy).toHaveBeenCalled();
	});

	test("series inferred from volume marker when the matched provider has none", async () => {
		itunesSearchSpy.mockImplementation(async () => [
			{
				...ITUNES_CANDIDATE,
				title: "ひげを剃る。そして女子高生を拾う。",
			},
		]);
		itunesGetByIdSpy.mockImplementation(async () => ({
			title: "ひげを剃る。そして女子高生を拾う。",
			description: "itunes desc",
		}));

		await audiobookMetadataService.quickMatch({
			...BASE_INPUT,
			title: "[1巻] ひげを剃る。そして女子高生を拾う。",
		});

		// saveMetadata upserts the inferred series and links it with position 1.
		expect(repositoryMock.upsertSeries).toHaveBeenCalledWith(
			"ひげを剃る。そして女子高生を拾う。",
			"server-1",
		);
		expect(repositoryMock.linkBookSeries).toHaveBeenCalledWith(1, 1, 1);
	});

	test("retries with a cleaned title when the raw title finds no match", async () => {
		const searches: string[] = [];
		audibleSearchSpy.mockImplementation(async (input) => {
			searches.push(input.title ?? "");
			if (input.title === "Great Story") {
				return [{ ...AUDIBLE_CANDIDATE, title: "Great Story" }];
			}
			return [];
		});
		audibleGetByIdSpy.mockImplementation(async () => AUDIBLE_FULL);
		audibleChaptersSpy.mockImplementation(async () => null);

		await audiobookMetadataService.quickMatch({
			...BASE_INPUT,
			title: "Great Story Vol. 3 (Unabridged)",
		});

		expect(searches).toEqual([
			"Great Story Vol. 3 (Unabridged)",
			"Great Story",
		]);
		expect(mockRecordRun).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				status: "enriched",
				matched: expect.arrayContaining([
					expect.objectContaining({ provider: "audible" }),
				]),
			}),
		);
	});

	test("duration disambiguates same-series volumes with near-identical titles", async () => {
		audibleSearchSpy.mockImplementation(async () => [
			{
				provider: "audible" as const,
				providerId: "B0VOL00001",
				title: "オーバーロード 1",
				duration: 14 * 3600, // right length
			},
			{
				provider: "audible" as const,
				providerId: "B0OMNIBUS1",
				title: "オーバーロード 1-3 合本版",
				duration: 40 * 3600, // omnibus edition, way off
			},
		]);
		audibleGetByIdSpy.mockImplementation(async () => AUDIBLE_FULL);
		audibleChaptersSpy.mockImplementation(async () => null);

		await audiobookMetadataService.quickMatch({
			...BASE_INPUT,
			title: "オーバーロード 1",
			duration: 14 * 3600 + 20,
		});

		expect(audibleGetByIdSpy).toHaveBeenCalledWith(
			"B0VOL00001",
			expect.anything(),
		);
	});

	test("candidates without duration still match on title alone", async () => {
		audibleSearchSpy.mockImplementation(async () => [AUDIBLE_CANDIDATE]);
		audibleGetByIdSpy.mockImplementation(async () => AUDIBLE_FULL);
		audibleChaptersSpy.mockImplementation(async () => null);

		await audiobookMetadataService.quickMatch({
			...BASE_INPUT,
			duration: 3600,
		});

		expect(mockRecordRun).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				status: "enriched",
				matched: expect.arrayContaining([
					expect.objectContaining({ provider: "audible" }),
				]),
			}),
		);
	});
});

describe("matchConfidence", () => {
	test("title-only scoring equals plain title similarity", () => {
		expect(matchConfidence("Great Story", { title: "Great Story" })).toBe(1);
		expect(
			matchConfidence("Great Story", { title: "Completely Different Book" }),
		).toBeLessThan(0.6);
	});

	test("matching duration and author rescue a mediocre title", () => {
		const weak = matchConfidence("ひげを剃る。そして女子高生を拾う。", {
			title: "ひげを剃る。そして女子高生を拾う。 [完全版]",
		});
		const rescued = matchConfidence(
			"ひげを剃る。そして女子高生を拾う。",
			{
				title: "ひげを剃る。そして女子高生を拾う。 [完全版]",
				duration: 7 * 3600 + 30,
				authors: [{ name: "しめさば" }],
			},
			{ duration: 7 * 3600, authors: [{ name: "しめさば" }] },
		);
		expect(rescued).toBeGreaterThan(weak);
	});

	test("a >10min duration gap penalizes but never sinks an exact title", () => {
		const score = matchConfidence(
			"Great Story",
			{ title: "Great Story", duration: 3600 },
			{ duration: 3600 + 20 * 60 },
		);
		expect(score).toBeGreaterThanOrEqual(0.6);
		expect(score).toBeLessThan(1);
	});

	test("duration within a minute counts as exact (Audible rounds to minutes)", () => {
		const score = matchConfidence(
			"Great Story",
			{ title: "Great Story", duration: 3600 },
			{ duration: 3600 + 59 },
		);
		expect(score).toBe(1);
	});
});

describe("cleanVolumeNoise", () => {
	test("strips volume suffixes, brackets and format noise", () => {
		expect(cleanVolumeNoise("Title Vol. 3")).toBe("Title");
		expect(cleanVolumeNoise("Title Book 12")).toBe("Title");
		expect(cleanVolumeNoise("Title #4")).toBe("Title");
		expect(cleanVolumeNoise("Title (Unabridged)")).toBe("Title");
		expect(cleanVolumeNoise("Title [2024 Remaster]")).toBe("Title");
		expect(cleanVolumeNoise("Plain Title")).toBe("Plain Title");
	});
});

describe("searchProviderForBook", () => {
	test("a valid ASIN searches Audible first, even with iTunes selected", async () => {
		audibleSearchSpy.mockImplementation(async () => [AUDIBLE_CANDIDATE]);

		const results = await audiobookMetadataService.searchProviderForBook(
			"itunes",
			1,
			{ title: "whatever", asin: "B0ASIN1234" },
		);

		expect(results).toEqual([AUDIBLE_CANDIDATE]);
		expect(audibleSearchSpy).toHaveBeenCalledWith(
			{ title: "B0ASIN1234", authors: undefined },
			{ region: "us" },
		);
		expect(itunesSearchSpy).not.toHaveBeenCalled();
	});

	test("falls back to the selected provider when the ASIN yields nothing", async () => {
		audibleSearchSpy.mockImplementation(async () => []);
		itunesSearchSpy.mockImplementation(async () => [ITUNES_CANDIDATE]);

		const results = await audiobookMetadataService.searchProviderForBook(
			"itunes",
			1,
			{ title: "Great Story", asin: "B0ASIN1234" },
		);

		expect(results).toEqual([ITUNES_CANDIDATE]);
		expect(itunesSearchSpy).toHaveBeenCalled();
	});

	test("library region flows into the manual search", async () => {
		mockGetLibraryMetadataConfig.mockImplementation(() =>
			Promise.resolve({ audible: { region: "jp" } }),
		);
		itunesSearchSpy.mockImplementation(async () => []);

		await audiobookMetadataService.searchProviderForBook("itunes", 1, {
			title: "Great Story",
		});

		expect(itunesSearchSpy).toHaveBeenCalledWith(
			{ title: "Great Story", authors: undefined },
			{ region: "jp" },
		);
	});

	test("a transient provider failure remains a retry-later API error", async () => {
		itunesSearchSpy.mockRejectedValue(
			new CatalogProviderError("transient", "server_error"),
		);

		await expect(
			audiobookMetadataService.searchProviderForBook("itunes", 1, {
				title: "Great Story",
			}),
		).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", status: 429 });
	});
});

describe("enrichFromProvider", () => {
	test("manual provider apply also leaves an existing cover path untouched", async () => {
		mockGetCoverByBookId.mockImplementation(async () =>
			Promise.resolve("data/covers/uuid-1_w1200.jpg"),
		);
		itunesGetByIdSpy.mockImplementation(async () => ({
			title: "Great Story",
			cover: "data/covers/uuid-1.jpg",
		}));

		await audiobookMetadataService.enrichFromProvider("itunes", {
			...BASE_INPUT,
			providerId: "12345",
		});

		const [, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
			number,
			Record<string, unknown>,
		];
		expect(saved.cover).toBeUndefined();
		expect(itunesGetByIdSpy).toHaveBeenCalledWith("12345", {
			region: "us",
			bookUuid: undefined,
		});
	});

	test("itunes apply saves metadata without chapters", async () => {
		itunesGetByIdSpy.mockImplementation(async () => ({
			title: "Great Story",
			description: "itunes desc",
		}));

		const result = await audiobookMetadataService.enrichFromProvider("itunes", {
			...BASE_INPUT,
			providerId: "12345",
		});

		expect(result).toEqual({ bookId: 1 });
		expect(mockReplaceChapters).not.toHaveBeenCalled();
		expect(mockRecordRun).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				status: "enriched",
				matched: [expect.objectContaining({ provider: "itunes" })],
			}),
		);
	});

	test("enrichFromAudible alias keeps working with an asin", async () => {
		audibleGetByIdSpy.mockImplementation(async () => AUDIBLE_FULL);
		audibleChaptersSpy.mockImplementation(async () => CHAPTERS);

		const result = await audiobookMetadataService.enrichFromAudible({
			...BASE_INPUT,
			asin: "B0ASIN",
		});

		expect(result).toEqual({ bookId: 1 });
		expect(mockReplaceChapters).toHaveBeenCalled();
		expect(mockRecordRun).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				status: "enriched",
				matched: [expect.objectContaining({ provider: "audible" })],
			}),
		);
	});
});

describe("locked fields (manual-edit protection)", () => {
	test("enrichment never overwrites locked scalars or narrators", async () => {
		mockGetLockedFields.mockImplementation(() =>
			Promise.resolve(["title", "narrators"]),
		);
		audibleSearchSpy.mockImplementation(async () => [AUDIBLE_CANDIDATE]);
		audibleGetByIdSpy.mockImplementation(async () => AUDIBLE_FULL);
		audibleChaptersSpy.mockImplementation(async () => null);

		await audiobookMetadataService.quickMatch({ ...BASE_INPUT });

		const [, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
			number,
			Record<string, unknown>,
		];
		expect(saved.title).toBeUndefined();
		expect(saved.description).toBe("audible desc");
		expect(repositoryMock.upsertNarrator).not.toHaveBeenCalled();
	});

	test("fix-match (enrichFromProvider) also respects locks", async () => {
		mockGetLockedFields.mockImplementation(() =>
			Promise.resolve(["description"]),
		);
		itunesGetByIdSpy.mockImplementation(async () => ({
			title: "Great Story",
			description: "itunes desc",
		}));

		await audiobookMetadataService.enrichFromProvider("itunes", {
			...BASE_INPUT,
			providerId: "12345",
		});

		const [, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
			number,
			Record<string, unknown>,
		];
		expect(saved.description).toBeUndefined();
	});
});

describe("applyManualEdit", () => {
	test("saves provided fields and locks exactly those", async () => {
		await audiobookMetadataService.applyManualEdit(1, {
			title: "Manual Title",
			narrators: [{ name: "Voice A" }],
		});

		const [bookId, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
			number,
			Record<string, unknown>,
		];
		expect(bookId).toBe(1);
		expect(saved.title).toBe("Manual Title");
		expect(repositoryMock.clearBookNarrators).toHaveBeenCalledTimes(1);
		expect(repositoryMock.upsertNarrator).toHaveBeenCalledWith(
			"Voice A",
			"server-1",
		);
		expect(mockAddLockedFields).toHaveBeenCalledWith(1, ["title", "narrators"]);
	});

	test("unlockFields re-opens fields to enrichment", async () => {
		await audiobookMetadataService.applyManualEdit(1, {}, ["narrators"]);
		expect(mockRemoveLockedFields).toHaveBeenCalledWith(1, ["narrators"]);
	});

	test("publisher: null clears the link; genres fully replaced", async () => {
		await audiobookMetadataService.applyManualEdit(1, {
			publisher: null,
			genres: ["Fantasy"],
		});

		const [, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
			number,
			Record<string, unknown>,
		];
		expect(saved.publisherId).toBeNull();
		expect(repositoryMock.clearBookGenres).toHaveBeenCalledTimes(1);
		expect(repositoryMock.upsertGenre).toHaveBeenCalledWith(
			"Fantasy",
			"server-1",
		);
	});
});

describe("restoreOriginal", () => {
	test("replaces enriched metadata and relations with the original snapshot", async () => {
		mockGetOriginalMetadata.mockImplementation(() =>
			Promise.resolve({
				metadata: { bookId: 1, title: "Local title", publisherId: 7 },
				authors: [{ name: "Local author", role: "Author" }],
				narrators: [{ name: "Local narrator" }],
				series: { name: "Local series", position: 2 },
				genres: ["Local genre"],
				tags: ["local-tag"],
				chapters: [{ index: 0, title: "Chapter 1", startTime: 0, endTime: 60 }],
			}),
		);

		await audiobookMetadataService.restoreOriginal(1);

		expect(repositoryMock.clearBookAuthors).toHaveBeenCalledWith(1);
		expect(repositoryMock.clearBookNarrators).toHaveBeenCalledWith(1);
		expect(repositoryMock.clearBookSeries).toHaveBeenCalledWith(1);
		expect(repositoryMock.clearBookGenres).toHaveBeenCalledWith(1);
		expect(repositoryMock.clearBookTags).toHaveBeenCalledWith(1);
		expect(mockUpsertMetadata).toHaveBeenCalledWith(
			1,
			expect.objectContaining({ title: "Local title", publisherId: 7 }),
		);
		expect(mockReplaceChapters).toHaveBeenLastCalledWith(1, [
			{ index: 0, title: "Chapter 1", startTime: 0, endTime: 60 },
		]);
		expect(mockResetForRetry).toHaveBeenCalledWith([1]);
	});
});
