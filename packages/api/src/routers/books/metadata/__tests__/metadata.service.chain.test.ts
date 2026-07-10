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

const mockMarkAmazonEnriched = mock(() => Promise.resolve());
const mockGetLibraryProviderOrder = mock(() =>
	Promise.resolve(null as string[] | null),
);
const mockReplaceBookAuthors = mock(() =>
	Promise.resolve({ authorIds: [1], removedAuthorIds: [] as number[] }),
);
const mockUpsertMetadata = mock(() => Promise.resolve({ bookId: 1 }));
const mockGetEnrichRow = mock(() =>
	Promise.resolve(undefined as Record<string, unknown> | undefined),
);
const mockUpsertTagsAndLink = mock(() => Promise.resolve());

mock.module("../metadata.repository", () => ({
	bookMetadataRepository: {
		getServerIdByBookId: mock(() => Promise.resolve("server-1")),
		upsertMetadata: mockUpsertMetadata,
		getEnrichRowByBookId: mockGetEnrichRow,
		upsertPublisher: mock(() => Promise.resolve(1)),
		upsertSeries: mock(() => Promise.resolve(1)),
		replaceBookAuthors: mockReplaceBookAuthors,
		upsertGenresAndLink: mock(() => Promise.resolve()),
		upsertTagsAndLink: mockUpsertTagsAndLink,
		clearBookTags: mock(() => Promise.resolve()),
		deleteAuthorsIfOrphaned: mock(() => Promise.resolve()),
		linkBookSeries: mock(() => Promise.resolve()),
		clearBookSeries: mock(() => Promise.resolve()),
		clearBookAuthors: mock(() => Promise.resolve()),
		clearBookGenres: mock(() => Promise.resolve()),
		getBookSeriesIds: mock(() => Promise.resolve([])),
		getBookAuthors: mock(() => Promise.resolve([])),
		deleteSeriesIfOrphaned: mock(() => Promise.resolve()),
		deleteAuthorIfOrphaned: mock(() => Promise.resolve()),
		saveOriginalMetadata: mock(() => Promise.resolve()),
		getOriginalMetadata: mock(() => Promise.resolve(null)),
		resetMetadata: mock(() => Promise.resolve()),
		isAmazonEnriched: mock(() => Promise.resolve(false)),
		markAmazonEnriched: mockMarkAmazonEnriched,
		getLibraryProviderOrder: mockGetLibraryProviderOrder,
		getLibraryMetadataConfig: mock(() => Promise.resolve(null)),
	},
}));

const { bookMetadataService } = await import("../metadata.service");
const { amazonProvider } = await import("../providers/amazon.provider");
const { ranobedbProvider } = await import("../providers/ranobedb.provider");
const { localProvider } = await import("../providers/local.provider");

// Spy on the provider singletons instead of mocking their modules so
// amazon.provider.test.ts keeps the real module in the shared process.
const amazonSpy = spyOn(amazonProvider, "getMetadata");
const ranobedbSpy = spyOn(ranobedbProvider, "getMetadata");
const localSpy = spyOn(localProvider, "getMetadata");

// Restore the real methods so later test files see the actual providers
afterAll(() => {
	amazonSpy.mockRestore();
	ranobedbSpy.mockRestore();
	localSpy.mockRestore();
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
	mockGetEnrichRow.mockReset();
	mockGetLibraryProviderOrder.mockImplementation(() => Promise.resolve(null));
	amazonSpy.mockImplementation(() => Promise.resolve({}));
	ranobedbSpy.mockImplementation(() => Promise.resolve({}));
	localSpy.mockImplementation(() => Promise.resolve({}));
	mockGetEnrichRow.mockImplementation(() => Promise.resolve(undefined));
});

describe("enrichFromProviders", () => {
	test("runs providers in default order: ranobedb then amazon", async () => {
		const calls: string[] = [];
		ranobedbSpy.mockImplementation(async () => {
			calls.push("ranobedb");
			return {};
		});
		amazonSpy.mockImplementation(async () => {
			calls.push("amazon");
			return {};
		});

		await bookMetadataService.enrichFromProviders({ ...BASE_INPUT });
		expect(calls).toEqual(["ranobedb", "amazon"]);
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
