import {
	afterAll,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";

// ─── Mocks (queues/search/repository — avoid Redis & Postgres) ──────

mock.module(
	"../../../../infrastructure/queue/queues/cover-color.queue",
	() => ({
		coverColorQueue: { add: mock(() => Promise.resolve()) },
	}),
);

mock.module("../../../../infrastructure/search/search-sync.service", () => ({
	enqueueSearchSync: mock(() => Promise.resolve()),
	enqueueAuthorSync: mock(() => Promise.resolve()),
	enqueueSeriesSync: mock(() => Promise.resolve()),
	enqueueBulkEntitySync: mock(() => Promise.resolve()),
}));

// Patch the repository singleton in place (spyOn + restore) instead of
// mock.module: module mocks leak across test files in the shared bun process
// and would hide the real repository from its own unit tests.
const { bookMetadataRepository } = await import("../metadata.repository");

const mockMarkAmazonEnriched = spyOn(
	bookMetadataRepository,
	"markAmazonEnriched",
).mockImplementation(() => Promise.resolve());
const mockGetLibraryProviderOrder = spyOn(
	bookMetadataRepository,
	"getLibraryProviderOrder",
).mockImplementation(() => Promise.resolve(null as unknown as string[]));
const mockReplaceBookAuthors = spyOn(
	bookMetadataRepository,
	"replaceBookAuthors",
).mockImplementation(() =>
	Promise.resolve({ authorIds: [1], removedAuthorIds: [] as number[] }),
);
const mockUpsertMetadata = spyOn(
	bookMetadataRepository,
	"upsertMetadata",
).mockImplementation(() =>
	Promise.resolve({ bookId: 1 } as Awaited<
		ReturnType<typeof bookMetadataRepository.upsertMetadata>
	>),
);
const mockGetEnrichRow = spyOn(
	bookMetadataRepository,
	"getEnrichRowByBookId",
).mockImplementation(() =>
	Promise.resolve(
		undefined as Awaited<
			ReturnType<typeof bookMetadataRepository.getEnrichRowByBookId>
		>,
	),
);
const mockUpsertTagsAndLink = spyOn(
	bookMetadataRepository,
	"upsertTagsAndLink",
).mockImplementation(() => Promise.resolve());
const mockUpsertGenresAndLink = spyOn(
	bookMetadataRepository,
	"upsertGenresAndLink",
).mockImplementation(() => Promise.resolve());
const mockUpsertPublisher = spyOn(
	bookMetadataRepository,
	"upsertPublisher",
).mockImplementation(() => Promise.resolve(1));
const mockLinkBookSeries = spyOn(
	bookMetadataRepository,
	"linkBookSeries",
).mockImplementation(() => Promise.resolve());
const mockClearBookSeries = spyOn(
	bookMetadataRepository,
	"clearBookSeries",
).mockImplementation(() => Promise.resolve());
const mockClearBookTags = spyOn(
	bookMetadataRepository,
	"clearBookTags",
).mockImplementation(() => Promise.resolve());
const mockClearBookGenres = spyOn(
	bookMetadataRepository,
	"clearBookGenres",
).mockImplementation(() => Promise.resolve());
const mockGetBookSeriesIds = spyOn(
	bookMetadataRepository,
	"getBookSeriesIds",
).mockImplementation(() => Promise.resolve([] as number[]));
const mockDeleteSeriesIfOrphaned = spyOn(
	bookMetadataRepository,
	"deleteSeriesIfOrphaned",
).mockImplementation(() => Promise.resolve());
const mockGetOriginalMetadata = spyOn(
	bookMetadataRepository,
	"getOriginalMetadata",
).mockImplementation(() => Promise.resolve(null));
const mockGetLockedFields = spyOn(
	bookMetadataRepository,
	"getLockedFields",
).mockImplementation(() => Promise.resolve([] as string[]));
const mockSetLockedFields = spyOn(
	bookMetadataRepository,
	"setLockedFields",
).mockImplementation(() => Promise.resolve());
const mockAddLockedFields = spyOn(
	bookMetadataRepository,
	"addLockedFields",
).mockImplementation(() => Promise.resolve());
const mockRemoveLockedFields = spyOn(
	bookMetadataRepository,
	"removeLockedFields",
).mockImplementation(() => Promise.resolve());

const repoSpies = [
	mockMarkAmazonEnriched,
	mockGetLibraryProviderOrder,
	mockReplaceBookAuthors,
	mockUpsertMetadata,
	mockGetEnrichRow,
	mockUpsertTagsAndLink,
	mockUpsertGenresAndLink,
	mockUpsertPublisher,
	mockLinkBookSeries,
	mockClearBookSeries,
	mockClearBookTags,
	mockClearBookGenres,
	mockGetBookSeriesIds,
	mockDeleteSeriesIfOrphaned,
	mockGetOriginalMetadata,
	mockGetLockedFields,
	mockSetLockedFields,
	mockAddLockedFields,
	mockRemoveLockedFields,
	spyOn(bookMetadataRepository, "getServerIdByBookId").mockImplementation(() =>
		Promise.resolve("server-1"),
	),
	spyOn(bookMetadataRepository, "upsertSeries").mockImplementation(() =>
		Promise.resolve(1),
	),
	spyOn(bookMetadataRepository, "clearBookAuthors").mockImplementation(() =>
		Promise.resolve(),
	),
	spyOn(bookMetadataRepository, "getBookAuthors").mockImplementation(() =>
		Promise.resolve([]),
	),
	spyOn(bookMetadataRepository, "deleteAuthorIfOrphaned").mockImplementation(
		() => Promise.resolve(),
	),
	spyOn(bookMetadataRepository, "saveOriginalMetadata").mockImplementation(() =>
		Promise.resolve(),
	),
	spyOn(bookMetadataRepository, "resetMetadata").mockImplementation(() =>
		Promise.resolve(),
	),
	spyOn(bookMetadataRepository, "isAmazonEnriched").mockImplementation(() =>
		Promise.resolve(false),
	),
	spyOn(bookMetadataRepository, "getLibraryMetadataConfig").mockImplementation(
		() => Promise.resolve(null),
	),
];
const mockGetEnrichmentGaps = spyOn(
	bookMetadataRepository,
	"getEnrichmentGaps",
).mockImplementation(() =>
	Promise.resolve(
		undefined as Awaited<
			ReturnType<typeof bookMetadataRepository.getEnrichmentGaps>
		>,
	),
);
repoSpies.push(mockGetEnrichmentGaps);

const { bookMetadataService } = await import("../metadata.service");
const { amazonProvider } = await import("../providers/amazon.provider");
const { ranobedbProvider } = await import("../providers/ranobedb.provider");
const { localProvider } = await import("../providers/local.provider");
const { googlebooksProvider } = await import(
	"../providers/googlebooks.provider"
);
const { openlibraryProvider } = await import(
	"../providers/openlibrary.provider"
);
const { goodreadsProvider } = await import("../providers/goodreads.provider");
const { comicvineProvider } = await import("../providers/comicvine.provider");
const { hardcoverProvider } = await import("../providers/hardcover.provider");

// Spy on the provider singletons instead of mocking their modules so
// amazon.provider.test.ts keeps the real module in the shared process.
const amazonSpy = spyOn(amazonProvider, "getMetadata");
const ranobedbSpy = spyOn(ranobedbProvider, "getMetadata");
const localSpy = spyOn(localProvider, "getMetadata");
const googlebooksSpy = spyOn(googlebooksProvider, "getMetadata");
const openlibrarySpy = spyOn(openlibraryProvider, "getMetadata");
const goodreadsSpy = spyOn(goodreadsProvider, "getMetadata");
const comicvineSpy = spyOn(comicvineProvider, "getMetadata");
const hardcoverSpy = spyOn(hardcoverProvider, "getMetadata");
const amazonSearchSpy = spyOn(amazonProvider, "search");
const amazonGetByIdSpy = spyOn(amazonProvider, "getById");
const amazonProductUrlSpy = spyOn(amazonProvider, "productUrl");
const ranobedbSearchSpy = spyOn(ranobedbProvider, "search");
const ranobedbGetByIdSpy = spyOn(ranobedbProvider, "getById");
const openlibraryGetByIdSpy = spyOn(openlibraryProvider, "getById");

// Restore the real methods so later test files see the actual providers/repo
afterAll(() => {
	amazonSpy.mockRestore();
	ranobedbSpy.mockRestore();
	localSpy.mockRestore();
	googlebooksSpy.mockRestore();
	openlibrarySpy.mockRestore();
	goodreadsSpy.mockRestore();
	comicvineSpy.mockRestore();
	hardcoverSpy.mockRestore();
	amazonSearchSpy.mockRestore();
	amazonGetByIdSpy.mockRestore();
	amazonProductUrlSpy.mockRestore();
	ranobedbSearchSpy.mockRestore();
	ranobedbGetByIdSpy.mockRestore();
	openlibraryGetByIdSpy.mockRestore();
	for (const spy of repoSpies) spy.mockRestore();
});

const BASE_INPUT = { bookId: 1, uuid: "uuid-1", title: "テスト 1" };

// Input with every field both providers could contribute already present
const FULL_INPUT = {
	bookId: 1,
	uuid: "uuid-1",
	title: "テスト 1",
	titleRomaji: "Tesuto 1",
	description: "desc",
	publishedDate: "2024-01-01",
	pageCount: 200,
	isbn13: "9784000000000",
	asin: "B000000000",
	cover: "data/covers/x.jpg",
	authors: [{ name: "A", role: "Author" }],
	publisher: { name: "P" },
	series: { name: "S", position: 1 },
	genres: ["Fantasy"],
	tags: ["isekai"],
	amazonRating: 4.5,
	amazonReviewCount: 100,
};

beforeEach(() => {
	amazonSpy.mockReset();
	ranobedbSpy.mockReset();
	localSpy.mockReset();
	mockMarkAmazonEnriched.mockClear();
	mockReplaceBookAuthors.mockClear();
	mockUpsertMetadata.mockClear();
	mockUpsertTagsAndLink.mockClear();
	mockUpsertGenresAndLink.mockClear();
	mockUpsertPublisher.mockClear();
	mockLinkBookSeries.mockClear();
	mockClearBookSeries.mockClear();
	mockClearBookTags.mockClear();
	mockClearBookGenres.mockClear();
	mockDeleteSeriesIfOrphaned.mockClear();
	mockSetLockedFields.mockClear();
	mockAddLockedFields.mockClear();
	mockRemoveLockedFields.mockClear();
	mockGetEnrichRow.mockReset();
	mockGetBookSeriesIds.mockReset();
	mockGetLockedFields.mockReset();
	mockGetOriginalMetadata.mockReset();
	mockGetLibraryProviderOrder.mockImplementation(() => Promise.resolve(null));
	amazonSearchSpy.mockReset();
	amazonGetByIdSpy.mockReset();
	ranobedbSearchSpy.mockReset();
	ranobedbGetByIdSpy.mockReset();
	amazonSpy.mockImplementation(() => Promise.resolve({}));
	ranobedbSpy.mockImplementation(() => Promise.resolve({}));
	localSpy.mockImplementation(() => Promise.resolve({}));
	googlebooksSpy.mockReset();
	openlibrarySpy.mockReset();
	goodreadsSpy.mockReset();
	comicvineSpy.mockReset();
	hardcoverSpy.mockReset();
	googlebooksSpy.mockImplementation(() => Promise.resolve({}));
	openlibrarySpy.mockImplementation(() => Promise.resolve({}));
	goodreadsSpy.mockImplementation(() => Promise.resolve({}));
	comicvineSpy.mockImplementation(() => Promise.resolve({}));
	hardcoverSpy.mockImplementation(() => Promise.resolve({}));
	openlibraryGetByIdSpy.mockReset();
	openlibraryGetByIdSpy.mockImplementation(async () => null);
	amazonSearchSpy.mockImplementation(async () => []);
	amazonGetByIdSpy.mockImplementation(async () => null);
	amazonProductUrlSpy.mockReset();
	amazonProductUrlSpy.mockImplementation(
		async (asin: string) => `https://www.amazon.co.jp/dp/${asin}`,
	);
	ranobedbSearchSpy.mockImplementation(async () => []);
	ranobedbGetByIdSpy.mockImplementation(async () => null);
	mockGetEnrichRow.mockImplementation(() => Promise.resolve(undefined));
	mockGetBookSeriesIds.mockImplementation(() => Promise.resolve([]));
	mockGetLockedFields.mockImplementation(() => Promise.resolve([]));
	mockGetOriginalMetadata.mockImplementation(() => Promise.resolve(null));
	mockGetEnrichmentGaps.mockReset();
	mockGetEnrichmentGaps.mockImplementation(() => Promise.resolve(undefined));
});

describe("enrichFromProviders", () => {
	test("runs providers in default order: ranobedb first, HTTP providers after amazon", async () => {
		const calls: string[] = [];
		const track = (name: string) => async () => {
			calls.push(name);
			return {};
		};
		ranobedbSpy.mockImplementation(track("ranobedb"));
		amazonSpy.mockImplementation(track("amazon"));
		googlebooksSpy.mockImplementation(track("googlebooks"));
		openlibrarySpy.mockImplementation(track("openlibrary"));
		goodreadsSpy.mockImplementation(track("goodreads"));
		hardcoverSpy.mockImplementation(track("hardcover"));
		comicvineSpy.mockImplementation(track("comicvine"));

		await bookMetadataService.enrichFromProviders({ ...BASE_INPUT });
		expect(calls).toEqual([
			"ranobedb",
			"amazon",
			"googlebooks",
			"openlibrary",
			"goodreads",
			"hardcover",
			"comicvine",
		]);
	});

	test("an isbn13 found by googlebooks flows to the next provider", async () => {
		googlebooksSpy.mockImplementation(async () => ({
			isbn13: "9781234567890",
		}));
		let openlibraryInput: Record<string, unknown> = {};
		openlibrarySpy.mockImplementation(async (input) => {
			openlibraryInput = input as Record<string, unknown>;
			return {};
		});

		await bookMetadataService.enrichFromProviders({ ...BASE_INPUT }, [
			"googlebooks",
			"openlibrary",
		]);
		expect(openlibraryInput.isbn13).toBe("9781234567890");
	});

	test("a lone isbn10 is completed to isbn13 before the next provider runs", async () => {
		googlebooksSpy.mockImplementation(async () => ({
			isbn10: "4048915649",
		}));
		let openlibraryInput: Record<string, unknown> = {};
		openlibrarySpy.mockImplementation(async (input) => {
			openlibraryInput = input as Record<string, unknown>;
			return {};
		});

		await bookMetadataService.enrichFromProviders({ ...BASE_INPUT }, [
			"googlebooks",
			"openlibrary",
		]);
		expect(openlibraryInput.isbn10).toBe("4048915649");
		expect(openlibraryInput.isbn13).toBe("9784048915649");
	});

	test("passes the asin found by ranobedb to amazon", async () => {
		ranobedbSpy.mockImplementation(async () => ({
			asin: "B0CHAINED1",
			title: "テスト 1",
		}));
		let amazonInput: Record<string, unknown> = {};
		amazonSpy.mockImplementation(async (input) => {
			amazonInput = input as Record<string, unknown>;
			return {};
		});

		await bookMetadataService.enrichFromProviders({ ...BASE_INPUT });
		expect(amazonInput.asin).toBe("B0CHAINED1");
	});

	test("respects the library's provider order", async () => {
		mockGetLibraryProviderOrder.mockImplementation(() =>
			Promise.resolve(["amazon"]),
		);

		await bookMetadataService.enrichFromProviders({ ...BASE_INPUT });
		expect(amazonSpy).toHaveBeenCalledTimes(1);
		expect(ranobedbSpy).not.toHaveBeenCalled();
	});

	test("explicit order argument overrides the library order", async () => {
		mockGetLibraryProviderOrder.mockImplementation(() =>
			Promise.resolve(["amazon"]),
		);

		await bookMetadataService.enrichFromProviders({ ...BASE_INPUT }, [
			"ranobedb",
		]);
		expect(ranobedbSpy).toHaveBeenCalledTimes(1);
		expect(amazonSpy).not.toHaveBeenCalled();
	});

	test("skips a provider when all its fields are already filled", async () => {
		await bookMetadataService.enrichFromProviders({ ...FULL_INPUT }, [
			"ranobedb",
			"amazon",
		]);
		expect(ranobedbSpy).not.toHaveBeenCalled();
		expect(amazonSpy).not.toHaveBeenCalled();
		// Still marked as enriched so it isn't retried
		expect(mockMarkAmazonEnriched).toHaveBeenCalledTimes(1);
	});

	test("provider tags are persisted via upsertTagsAndLink", async () => {
		ranobedbSpy.mockImplementation(async () => ({
			tags: ["isekai", "villainess"],
		}));

		await bookMetadataService.enrichFromProviders({ ...BASE_INPUT }, [
			"ranobedb",
		]);

		expect(mockUpsertTagsAndLink).toHaveBeenCalledWith(
			1,
			["isekai", "villainess"],
			"server-1",
		);
	});

	test("authors from the first provider win; later providers don't override", async () => {
		ranobedbSpy.mockImplementation(async () => ({
			authors: [{ name: "RanobeDB Author", role: "Author" }],
		}));
		amazonSpy.mockImplementation(async () => ({
			authors: [{ name: "Amazon Author", role: "Author" }],
			amazonRating: 4.2,
		}));

		await bookMetadataService.enrichFromProviders({ ...BASE_INPUT });

		const call = mockReplaceBookAuthors.mock.calls[0] as
			| [number, { name: string }[], string, string]
			| undefined;
		const authorNames = call?.[1].map((a) => a.name);
		expect(authorNames).toEqual(["RanobeDB Author"]);
		// Provider tag comes from the provider that supplied the authors
		expect(call?.[2]).toBe("RANOBEDB");
	});

	test("falls back to default order when library order has only unknown names", async () => {
		mockGetLibraryProviderOrder.mockImplementation(() =>
			Promise.resolve(["bogus-provider"]),
		);

		await bookMetadataService.enrichFromProviders({ ...BASE_INPUT });
		expect(ranobedbSpy).toHaveBeenCalledTimes(1);
		expect(amazonSpy).toHaveBeenCalledTimes(1);
	});

	test("returns null and marks enriched when no provider returns data", async () => {
		const result = await bookMetadataService.enrichFromProviders({
			...BASE_INPUT,
		});
		expect(result).toBeNull();
		expect(mockMarkAmazonEnriched).toHaveBeenCalledTimes(1);
	});

	test("marks enriched exactly once after a successful chain", async () => {
		ranobedbSpy.mockImplementation(async () => ({
			description: "from ranobedb",
		}));

		await bookMetadataService.enrichFromProviders({ ...BASE_INPUT });
		expect(mockMarkAmazonEnriched).toHaveBeenCalledTimes(1);
	});

	test("enrichFromAmazon is an alias for the chain", async () => {
		ranobedbSpy.mockImplementation(async () => ({
			description: "from ranobedb",
		}));

		await bookMetadataService.enrichFromAmazon({ ...BASE_INPUT });
		expect(ranobedbSpy).toHaveBeenCalledTimes(1);
	});

	test("a blocked provider saves partial results but does NOT mark enriched", async () => {
		const { AmazonTransientError } = await import(
			"../providers/amazon.provider"
		);
		ranobedbSpy.mockImplementation(async () => ({
			description: "from ranobedb",
		}));
		amazonSpy.mockImplementation(async () => {
			throw new AmazonTransientError("blocked");
		});

		const result = await bookMetadataService.enrichFromProviders({
			...BASE_INPUT,
		});

		expect(result).not.toBeNull();
		expect(mockUpsertMetadata).toHaveBeenCalledTimes(1);
		// Amazon never ran: the flag must stay unset so a reprocess retries it.
		expect(mockMarkAmazonEnriched).not.toHaveBeenCalled();
	});

	test("a transient HTTP-provider failure also skips the enriched mark", async () => {
		const { ProviderTransientError } = await import(
			"../providers/provider.utils"
		);
		ranobedbSpy.mockImplementation(async () => ({
			description: "from ranobedb",
		}));
		googlebooksSpy.mockImplementation(async () => {
			throw new ProviderTransientError("Google Books is unreachable");
		});

		const result = await bookMetadataService.enrichFromProviders(
			{ ...BASE_INPUT },
			["ranobedb", "googlebooks"],
		);

		expect(result).not.toBeNull();
		expect(mockUpsertMetadata).toHaveBeenCalledTimes(1);
		expect(mockMarkAmazonEnriched).not.toHaveBeenCalled();
	});

	test("only transient failures with no results raise TooManyRequests", async () => {
		const { ProviderTransientError } = await import(
			"../providers/provider.utils"
		);
		googlebooksSpy.mockImplementation(async () => {
			throw new ProviderTransientError("Google Books is unreachable");
		});

		await expect(
			bookMetadataService.enrichFromProviders({ ...BASE_INPUT }, [
				"googlebooks",
			]),
		).rejects.toThrow(/Wait a few minutes/);
		expect(mockMarkAmazonEnriched).not.toHaveBeenCalled();
	});

	describe("refresh mode", () => {
		test("re-consults providers even when every field is already filled", async () => {
			ranobedbSpy.mockImplementation(async () => ({}));
			amazonSpy.mockImplementation(async () => ({ amazonRating: 4.9 }));

			await bookMetadataService.enrichFromProviders(
				{ ...FULL_INPUT },
				undefined,
				{ refresh: true },
			);

			expect(ranobedbSpy).toHaveBeenCalledTimes(1);
			expect(amazonSpy).toHaveBeenCalledTimes(1);
			const [, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
				number,
				Record<string, unknown>,
			];
			expect(saved.amazonRating).toBe(4.9);
		});

		test("keeps identifiers so matching still works, and fresh values win over DB ones", async () => {
			let amazonInput: Record<string, unknown> = {};
			amazonSpy.mockImplementation(async (input) => {
				amazonInput = input as Record<string, unknown>;
				return { description: "fresh description" };
			});

			await bookMetadataService.enrichFromProviders(
				{ ...FULL_INPUT },
				undefined,
				{ refresh: true },
			);

			// asin/isbn survive the refresh strip — they drive the lookup.
			expect(amazonInput.asin).toBe("B000000000");
			// Stale DB description was cleared, so the provider's value is saved.
			const [, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
				number,
				Record<string, unknown>,
			];
			expect(saved.description).toBe("fresh description");
		});

		test("fields a provider does not return are left untouched, not cleared", async () => {
			amazonSpy.mockImplementation(async () => ({ amazonRating: 4.1 }));
			ranobedbSpy.mockImplementation(async () => ({}));

			await bookMetadataService.enrichFromProviders(
				{ ...FULL_INPUT },
				undefined,
				{ refresh: true },
			);

			const [, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
				number,
				Record<string, unknown>,
			];
			// Not returned by any provider → absent from the patch (no null wipe).
			expect("description" in saved).toBe(false);
			expect(saved.amazonRating).toBe(4.1);
		});
	});
});

describe("needsExternalEnrichment", () => {
	const FULL_GAPS = {
		titleRomaji: "Tesuto",
		subtitle: "Sub",
		description: "d",
		publishedDate: "2024-01-01",
		languageCode: "ja",
		pageCount: 200,
		isbn10: "4000000000",
		isbn13: "9784000000000",
		asin: "B000000000",
		cover: "data/covers/x.jpg",
		amazonRating: 4.5,
		amazonReviewCount: 100,
		publisher: "P",
		hasAuthors: true,
		hasSeries: true,
		hasGenres: true,
		hasTags: true,
	};

	test("true when a provider field (amazonRating) is still missing", async () => {
		mockGetEnrichmentGaps.mockImplementation(() =>
			Promise.resolve({ ...FULL_GAPS, amazonRating: null }),
		);

		expect(await bookMetadataService.needsExternalEnrichment(1)).toBe(true);
	});

	test("false when every provider field is present", async () => {
		mockGetEnrichmentGaps.mockImplementation(() =>
			Promise.resolve({ ...FULL_GAPS }),
		);

		expect(await bookMetadataService.needsExternalEnrichment(1)).toBe(false);
	});

	test("respects the library's provider list — amazon-only gaps don't trigger a ranobedb-only chain", async () => {
		mockGetLibraryProviderOrder.mockImplementation(() =>
			Promise.resolve(["ranobedb"]),
		);
		mockGetEnrichmentGaps.mockImplementation(() =>
			Promise.resolve({
				...FULL_GAPS,
				amazonRating: null,
				amazonReviewCount: null,
			}),
		);

		expect(await bookMetadataService.needsExternalEnrichment(1)).toBe(false);
	});

	test("missing entity links (authors) count as gaps", async () => {
		mockGetEnrichmentGaps.mockImplementation(() =>
			Promise.resolve({ ...FULL_GAPS, hasAuthors: false }),
		);

		expect(await bookMetadataService.needsExternalEnrichment(1)).toBe(true);
	});

	test("false when the book row no longer exists", async () => {
		mockGetEnrichmentGaps.mockImplementation(() => Promise.resolve(undefined));

		expect(await bookMetadataService.needsExternalEnrichment(1)).toBe(false);
	});
});

describe("fillMissingFromLocal", () => {
	// A book with title/description already set (e.g. Amazon-enriched) but no
	// identifiers — the exact gap the reprocess pass exists to fill.
	const enrichedRow = {
		id: 7,
		uuid: "uuid-7",
		title: "既存タイトル",
		description: "existing description",
		asin: null,
		isbn10: null,
		isbn13: null,
		languageCode: "ja",
		cover: "data/covers/uuid-7.jpg",
		publisher: { name: "P" },
		authors: [{ name: "既存著者", role: null }],
	};

	test("writes only the missing fields — existing values are never overwritten", async () => {
		mockGetEnrichRow.mockImplementation(() =>
			Promise.resolve({ ...enrichedRow }),
		);
		localSpy.mockImplementation(async () => ({
			title: "EPUBのタイトル",
			description: "epub description",
			asin: "B08R8G4XMQ",
			isbn13: "9784040731278",
			embeddedUid: "3299511152",
			authors: [{ name: "EPUB著者", role: null }],
		}));

		const result = await bookMetadataService.fillMissingFromLocal({
			bookId: 7,
			uuid: "uuid-7",
		});

		expect(result).not.toBeNull();
		expect(mockUpsertMetadata).toHaveBeenCalledTimes(1);
		const [bookId, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
			number,
			Record<string, unknown>,
		];
		expect(bookId).toBe(7);
		expect(saved.asin).toBe("B08R8G4XMQ");
		expect(saved.isbn13).toBe("9784040731278");
		expect(saved.embeddedUid).toBe("3299511152");
		expect(saved.title).toBeUndefined();
		expect(saved.description).toBeUndefined();
		// Book already has authors: local ones must not replace them.
		expect(mockReplaceBookAuthors).not.toHaveBeenCalled();
	});

	test("returns null and saves nothing when no field is missing", async () => {
		mockGetEnrichRow.mockImplementation(() =>
			Promise.resolve({ ...enrichedRow, asin: "B000000001" }),
		);
		localSpy.mockImplementation(async () => ({
			asin: "B08R8G4XMQ",
			title: "EPUBのタイトル",
		}));

		const result = await bookMetadataService.fillMissingFromLocal({
			bookId: 7,
			uuid: "uuid-7",
		});

		expect(result).toBeNull();
		expect(mockUpsertMetadata).not.toHaveBeenCalled();
	});

	test("fills authors only when the book has none", async () => {
		mockGetEnrichRow.mockImplementation(() =>
			Promise.resolve({ ...enrichedRow, authors: [] }),
		);
		localSpy.mockImplementation(async () => ({
			authors: [{ name: "EPUB著者", role: null }],
		}));

		await bookMetadataService.fillMissingFromLocal({
			bookId: 7,
			uuid: "uuid-7",
		});

		expect(mockReplaceBookAuthors).toHaveBeenCalledTimes(1);
	});

	test("returns null when the book row is gone or the EPUB is unreadable", async () => {
		mockGetEnrichRow.mockImplementation(() => Promise.resolve(undefined));
		const missing = await bookMetadataService.fillMissingFromLocal({
			bookId: 7,
			uuid: "uuid-7",
		});
		expect(missing).toBeNull();
		expect(localSpy).not.toHaveBeenCalled();

		mockGetEnrichRow.mockImplementation(() =>
			Promise.resolve({ ...enrichedRow }),
		);
		localSpy.mockImplementation(async () => ({}));
		const unreadable = await bookMetadataService.fillMissingFromLocal({
			bookId: 7,
			uuid: "uuid-7",
		});
		expect(unreadable).toBeNull();
		expect(mockUpsertMetadata).not.toHaveBeenCalled();
	});
});

describe("locked fields (manual-edit protection)", () => {
	test("enrichment never overwrites locked scalar fields", async () => {
		mockGetLockedFields.mockImplementation(() =>
			Promise.resolve(["description"]),
		);
		ranobedbSpy.mockImplementation(async () => ({
			description: "from provider",
			pageCount: 200,
		}));

		await bookMetadataService.enrichFromProviders({ ...BASE_INPUT }, [
			"ranobedb",
		]);

		const [, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
			number,
			Record<string, unknown>,
		];
		expect(saved.description).toBeUndefined();
		expect(saved.pageCount).toBe(200);
	});

	test("locked entity links are not replaced by providers", async () => {
		mockGetLockedFields.mockImplementation(() =>
			Promise.resolve(["authors", "series", "genres", "tags", "publisher"]),
		);
		ranobedbSpy.mockImplementation(async () => ({
			description: "d",
			authors: [{ name: "Provider Author", role: "Author" }],
			publisher: { name: "Provider Pub" },
			series: { name: "Provider Series", position: 1 },
			genres: ["Fantasy"],
			tags: ["isekai"],
		}));

		await bookMetadataService.enrichFromProviders({ ...BASE_INPUT }, [
			"ranobedb",
		]);

		expect(mockReplaceBookAuthors).not.toHaveBeenCalled();
		expect(mockUpsertPublisher).not.toHaveBeenCalled();
		expect(mockLinkBookSeries).not.toHaveBeenCalled();
		expect(mockUpsertGenresAndLink).not.toHaveBeenCalled();
		expect(mockUpsertTagsAndLink).not.toHaveBeenCalled();
		// Unlocked scalar still saved.
		const [, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
			number,
			Record<string, unknown>,
		];
		expect(saved.description).toBe("d");
	});

	test("enrichAndSaveMetadata (local extract) also respects locks", async () => {
		mockGetLockedFields.mockImplementation(() => Promise.resolve(["title"]));
		localSpy.mockImplementation(async () => ({
			title: "EPUBのタイトル",
			languageCode: "ja",
		}));

		await bookMetadataService.enrichAndSaveMetadata({ bookId: 1, uuid: "u" });

		const [, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
			number,
			Record<string, unknown>,
		];
		expect(saved.title).toBeUndefined();
		expect(saved.languageCode).toBe("ja");
	});

	test("restoreOriginal wipes all locks", async () => {
		mockGetOriginalMetadata.mockImplementation(() =>
			Promise.resolve({ title: "original" }),
		);

		await bookMetadataService.restoreOriginal(1);

		expect(mockSetLockedFields).toHaveBeenCalledWith(1, []);
	});
});

describe("applyManualEdit", () => {
	test("saves provided fields (null clears) and locks exactly those", async () => {
		await bookMetadataService.applyManualEdit(1, {
			title: "手動タイトル",
			description: null,
			tags: ["cute"],
		});

		const [bookId, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
			number,
			Record<string, unknown>,
		];
		expect(bookId).toBe(1);
		expect(saved.title).toBe("手動タイトル");
		expect(saved.description).toBeNull();
		// Tags are a full replacement.
		expect(mockClearBookTags).toHaveBeenCalledTimes(1);
		expect(mockUpsertTagsAndLink).toHaveBeenCalledWith(1, ["cute"], "server-1");
		expect(mockAddLockedFields).toHaveBeenCalledWith(1, [
			"title",
			"description",
			"tags",
		]);
	});

	test("bypasses existing locks — the manual edit always wins", async () => {
		mockGetLockedFields.mockImplementation(() => Promise.resolve(["title"]));

		await bookMetadataService.applyManualEdit(1, { title: "nuevo" });

		const [, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
			number,
			Record<string, unknown>,
		];
		expect(saved.title).toBe("nuevo");
	});

	test("unlockFields re-opens fields to enrichment", async () => {
		await bookMetadataService.applyManualEdit(1, {}, ["description"]);
		expect(mockRemoveLockedFields).toHaveBeenCalledWith(1, ["description"]);
	});

	test("publisher: null clears the link, a name upserts it", async () => {
		await bookMetadataService.applyManualEdit(1, { publisher: null });
		let [, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
			number,
			Record<string, unknown>,
		];
		expect(saved.publisherId).toBeNull();

		mockUpsertMetadata.mockClear();
		await bookMetadataService.applyManualEdit(1, { publisher: "KADOKAWA" });
		expect(mockUpsertPublisher).toHaveBeenCalledWith("KADOKAWA", "server-1");
		[, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
			number,
			Record<string, unknown>,
		];
		expect(saved.publisherId).toBe(1);
	});

	test("series: null clears links and prunes orphans", async () => {
		mockGetBookSeriesIds.mockImplementation(() => Promise.resolve([5]));

		await bookMetadataService.applyManualEdit(1, { series: null });

		expect(mockClearBookSeries).toHaveBeenCalledTimes(1);
		expect(mockDeleteSeriesIfOrphaned).toHaveBeenCalledWith(5);
	});

	test("authors: [] clears via replaceBookAuthors", async () => {
		await bookMetadataService.applyManualEdit(1, { authors: [] });
		expect(mockReplaceBookAuthors).toHaveBeenCalledWith(
			1,
			[],
			"LOCAL",
			"server-1",
		);
	});

	test("genres are fully replaced", async () => {
		await bookMetadataService.applyManualEdit(1, { genres: ["Romance"] });
		expect(mockClearBookGenres).toHaveBeenCalledTimes(1);
		expect(mockUpsertGenresAndLink).toHaveBeenCalledWith(
			1,
			["Romance"],
			"server-1",
		);
	});
});

describe("searchProvider (manual fix-match)", () => {
	const CANDIDATE = {
		provider: "ranobedb" as const,
		providerId: "4242",
		title: "アクセル・ワールド12",
	};

	test("delegates to the provider with tenant options", async () => {
		ranobedbSearchSpy.mockImplementation(async () => [CANDIDATE]);

		const results = await bookMetadataService.searchProvider("ranobedb", 1, {
			title: "アクセル・ワールド12",
		});

		expect(results).toEqual([CANDIDATE]);
		expect(ranobedbSearchSpy).toHaveBeenCalledWith(
			{ title: "アクセル・ワールド12", author: undefined, asin: undefined },
			{ serverId: "server-1", amazonDomain: undefined },
		);
	});

	test("a pasted ASIN resolves the exact Amazon product first", async () => {
		amazonGetByIdSpy.mockImplementation(async () => ({
			title: "Exact Product",
			authors: [{ name: "Author X", role: "Author" }],
		}));

		const results = await bookMetadataService.searchProvider("ranobedb", 1, {
			title: "whatever",
			asin: "b0exact123",
		});

		expect(results).toEqual([
			{
				provider: "amazon",
				providerId: "B0EXACT123",
				title: "Exact Product",
				titleRomaji: null,
				authors: [{ name: "Author X" }],
				series: null,
				publishedDate: null,
				previewCover: null,
				url: "https://www.amazon.co.jp/dp/B0EXACT123",
			},
		]);
		expect(ranobedbSearchSpy).not.toHaveBeenCalled();
		// Candidate previews must never trigger a cover download.
		expect(amazonGetByIdSpy).toHaveBeenCalledWith("B0EXACT123", {
			serverId: "server-1",
			amazonDomain: undefined,
			keepRemoteCover: true,
		});
	});

	test("falls back to the provider search when the ASIN yields nothing", async () => {
		ranobedbSearchSpy.mockImplementation(async () => [CANDIDATE]);

		const results = await bookMetadataService.searchProvider("ranobedb", 1, {
			title: "アクセル・ワールド12",
			asin: "B0MISSING1",
		});

		expect(results).toEqual([CANDIDATE]);
	});

	test("maps AmazonTransientError to a rate-limit error", async () => {
		const { AmazonTransientError } = await import(
			"../providers/amazon.provider"
		);
		amazonSearchSpy.mockImplementation(async () => {
			throw new AmazonTransientError("blocked");
		});

		await expect(
			bookMetadataService.searchProvider("amazon", 1, { title: "x" }),
		).rejects.toThrow(/Wait a few minutes/);
	});

	const ALL_SEARCHABLE_PROVIDERS = [
		ranobedbProvider,
		amazonProvider,
		googlebooksProvider,
		openlibraryProvider,
		goodreadsProvider,
		comicvineProvider,
		hardcoverProvider,
	];

	// Spies isAvailable on every provider, runs fn, restores.
	async function withAvailability(
		impl: (provider: (typeof ALL_SEARCHABLE_PROVIDERS)[number]) => boolean,
		fn: () => Promise<void>,
	) {
		const spies = ALL_SEARCHABLE_PROVIDERS.map((provider) =>
			spyOn(provider, "isAvailable").mockImplementation(async () => {
				return impl(provider);
			}),
		);
		try {
			await fn();
		} finally {
			for (const spy of spies) spy.mockRestore();
		}
	}

	test("getAvailableProviders filters out unavailable providers, keeping chain order", async () => {
		// Everything available except the credential-gated pair.
		await withAvailability(
			(provider) =>
				provider !== comicvineProvider && provider !== hardcoverProvider,
			async () => {
				const available =
					await bookMetadataService.getAvailableProviders("server-1");
				expect(available).toEqual([
					"ranobedb",
					"amazon",
					"googlebooks",
					"openlibrary",
					"goodreads",
				]);
			},
		);
	});

	test("getAvailableProviders treats an availability check crash as unavailable", async () => {
		await withAvailability(
			(provider) => {
				if (provider === hardcoverProvider) {
					throw new Error("settings backend down");
				}
				return true;
			},
			async () => {
				const available =
					await bookMetadataService.getAvailableProviders("server-1");
				expect(available).not.toContain("hardcover");
				expect(available).toContain("ranobedb");
			},
		);
	});

	test("maps ProviderTransientError to a rate-limit error", async () => {
		const { ProviderTransientError } = await import(
			"../providers/provider.utils"
		);
		const { googlebooksProvider: gbProvider } = await import(
			"../providers/googlebooks.provider"
		);
		const searchSpy = spyOn(gbProvider, "search").mockImplementation(
			async () => {
				throw new ProviderTransientError("Google Books is unreachable");
			},
		);

		try {
			await expect(
				bookMetadataService.searchProvider("googlebooks", 1, { title: "x" }),
			).rejects.toThrow(/Wait a few minutes/);
		} finally {
			searchSpy.mockRestore();
		}
	});
});

describe("applyFromProvider (manual fix-match)", () => {
	test("fetches by id, saves with the provider tag and marks enriched", async () => {
		ranobedbGetByIdSpy.mockImplementation(async () => ({
			title: "アクセル・ワールド12",
			description: "d",
			authors: [{ name: "川原礫", role: "Author" }],
		}));

		const result = await bookMetadataService.applyFromProvider("ranobedb", {
			bookId: 1,
			uuid: "uuid-1",
			providerId: "4242",
		});

		expect(result).not.toBeNull();
		const [, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
			number,
			Record<string, unknown>,
		];
		expect(saved.title).toBe("アクセル・ワールド12");
		const authorsCall = mockReplaceBookAuthors.mock.calls[0] as
			| [number, unknown, string, string]
			| undefined;
		expect(authorsCall?.[2]).toBe("RANOBEDB");
		expect(mockMarkAmazonEnriched).toHaveBeenCalledTimes(1);
	});

	test("new HTTP providers save with their own tag (openlibrary)", async () => {
		openlibraryGetByIdSpy.mockImplementation(async () => ({
			title: "The Hobbit",
			authors: [{ name: "J. R. R. Tolkien", role: "Author" }],
		}));

		const result = await bookMetadataService.applyFromProvider("openlibrary", {
			bookId: 1,
			uuid: "uuid-1",
			providerId: "works/OL123W",
		});

		expect(result).not.toBeNull();
		expect(openlibraryGetByIdSpy).toHaveBeenCalledWith("works/OL123W", {
			serverId: "server-1",
			amazonDomain: undefined,
			uuid: "uuid-1",
		});
		const authorsCall = mockReplaceBookAuthors.mock.calls[0] as
			| [number, unknown, string, string]
			| undefined;
		expect(authorsCall?.[2]).toBe("OPENLIBRARY");
	});

	test("locked fields survive a re-match", async () => {
		mockGetLockedFields.mockImplementation(() =>
			Promise.resolve(["title", "authors"]),
		);
		ranobedbGetByIdSpy.mockImplementation(async () => ({
			title: "provider title",
			description: "provider description",
			authors: [{ name: "Provider Author", role: "Author" }],
		}));

		await bookMetadataService.applyFromProvider("ranobedb", {
			bookId: 1,
			uuid: "uuid-1",
			providerId: "4242",
		});

		const [, saved] = mockUpsertMetadata.mock.calls[0] as unknown as [
			number,
			Record<string, unknown>,
		];
		expect(saved.title).toBeUndefined();
		expect(saved.description).toBe("provider description");
		expect(mockReplaceBookAuthors).not.toHaveBeenCalled();
	});

	test("returns null (no save, no enriched mark) when the id yields nothing", async () => {
		const result = await bookMetadataService.applyFromProvider("amazon", {
			bookId: 1,
			uuid: "uuid-1",
			providerId: "B0MISSING1",
		});

		expect(result).toBeNull();
		expect(mockUpsertMetadata).not.toHaveBeenCalled();
		expect(mockMarkAmazonEnriched).not.toHaveBeenCalled();
	});

	test("passes the uuid so Amazon can localize the cover", async () => {
		amazonGetByIdSpy.mockImplementation(async () => ({ title: "T" }));

		await bookMetadataService.applyFromProvider("amazon", {
			bookId: 1,
			uuid: "uuid-1",
			providerId: "B0ASIN1234",
		});

		expect(amazonGetByIdSpy).toHaveBeenCalledWith("B0ASIN1234", {
			serverId: "server-1",
			amazonDomain: undefined,
			uuid: "uuid-1",
		});
	});
});
