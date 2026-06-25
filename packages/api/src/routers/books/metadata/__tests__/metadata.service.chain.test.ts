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
const mockUpsertAuthor = mock(() => Promise.resolve(1));

mock.module("../metadata.repository", () => ({
	bookMetadataRepository: {
		getServerIdByBookId: mock(() => Promise.resolve("server-1")),
		upsertMetadata: mock(() => Promise.resolve({ bookId: 1 })),
		upsertPublisher: mock(() => Promise.resolve(1)),
		upsertSeries: mock(() => Promise.resolve(1)),
		upsertAuthor: mockUpsertAuthor,
		upsertGenre: mock(() => Promise.resolve(1)),
		linkBookSeries: mock(() => Promise.resolve()),
		linkBookAuthor: mock(() => Promise.resolve()),
		linkBookGenre: mock(() => Promise.resolve()),
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
	},
}));

const { bookMetadataService } = await import("../metadata.service");
const { amazonProvider } = await import("../providers/amazon.provider");
const { ranobedbProvider } = await import("../providers/ranobedb.provider");

// Spy on the provider singletons instead of mocking their modules so
// amazon.provider.test.ts keeps the real module in the shared process.
const amazonSpy = spyOn(amazonProvider, "getMetadata");
const ranobedbSpy = spyOn(ranobedbProvider, "getMetadata");

// Restore the real methods so later test files see the actual providers
afterAll(() => {
	amazonSpy.mockRestore();
	ranobedbSpy.mockRestore();
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
	amazonRating: 4.5,
	amazonReviewCount: 100,
};

beforeEach(() => {
	amazonSpy.mockReset();
	ranobedbSpy.mockReset();
	mockMarkAmazonEnriched.mockClear();
	mockUpsertAuthor.mockClear();
	mockGetLibraryProviderOrder.mockImplementation(() => Promise.resolve(null));
	amazonSpy.mockImplementation(() => Promise.resolve({}));
	ranobedbSpy.mockImplementation(() => Promise.resolve({}));
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

	test("authors from the first provider win; later providers don't override", async () => {
		ranobedbSpy.mockImplementation(async () => ({
			authors: [{ name: "RanobeDB Author", role: "Author" }],
		}));
		amazonSpy.mockImplementation(async () => ({
			authors: [{ name: "Amazon Author", role: "Author" }],
			amazonRating: 4.2,
		}));

		await bookMetadataService.enrichFromProviders({ ...BASE_INPUT });

		const upsertedNames = mockUpsertAuthor.mock.calls.map((c) => c[0]);
		expect(upsertedNames).toEqual(["RanobeDB Author"]);
		// Provider tag comes from the provider that supplied the authors
		expect(mockUpsertAuthor.mock.calls[0]?.[1]).toBe("RANOBEDB");
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
