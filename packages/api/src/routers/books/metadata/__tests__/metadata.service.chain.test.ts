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
const mockUpsertGenresAndLink = mock(() => Promise.resolve());
const mockUpsertPublisher = mock(() => Promise.resolve(1));
const mockLinkBookSeries = mock(() => Promise.resolve());
const mockClearBookSeries = mock(() => Promise.resolve());
const mockClearBookTags = mock(() => Promise.resolve());
const mockClearBookGenres = mock(() => Promise.resolve());
const mockGetBookSeriesIds = mock(() => Promise.resolve([] as number[]));
const mockDeleteSeriesIfOrphaned = mock(() => Promise.resolve());
const mockGetOriginalMetadata = mock(() =>
	Promise.resolve(null as Record<string, unknown> | null),
);
const mockGetLockedFields = mock(() => Promise.resolve([] as string[]));
const mockSetLockedFields = mock(() => Promise.resolve());
const mockAddLockedFields = mock(() => Promise.resolve());
const mockRemoveLockedFields = mock(() => Promise.resolve());

mock.module("../metadata.repository", () => ({
	bookMetadataRepository: {
		getServerIdByBookId: mock(() => Promise.resolve("server-1")),
		upsertMetadata: mockUpsertMetadata,
		getEnrichRowByBookId: mockGetEnrichRow,
		upsertPublisher: mockUpsertPublisher,
		upsertSeries: mock(() => Promise.resolve(1)),
		replaceBookAuthors: mockReplaceBookAuthors,
		upsertGenresAndLink: mockUpsertGenresAndLink,
		upsertTagsAndLink: mockUpsertTagsAndLink,
		clearBookTags: mockClearBookTags,
		deleteAuthorsIfOrphaned: mock(() => Promise.resolve()),
		linkBookSeries: mockLinkBookSeries,
		clearBookSeries: mockClearBookSeries,
		clearBookAuthors: mock(() => Promise.resolve()),
		clearBookGenres: mockClearBookGenres,
		getBookSeriesIds: mockGetBookSeriesIds,
		getBookAuthors: mock(() => Promise.resolve([])),
		deleteSeriesIfOrphaned: mockDeleteSeriesIfOrphaned,
		deleteAuthorIfOrphaned: mock(() => Promise.resolve()),
		saveOriginalMetadata: mock(() => Promise.resolve()),
		getOriginalMetadata: mockGetOriginalMetadata,
		resetMetadata: mock(() => Promise.resolve()),
		isAmazonEnriched: mock(() => Promise.resolve(false)),
		markAmazonEnriched: mockMarkAmazonEnriched,
		getLibraryProviderOrder: mockGetLibraryProviderOrder,
		getLibraryMetadataConfig: mock(() => Promise.resolve(null)),
		getLockedFields: mockGetLockedFields,
		setLockedFields: mockSetLockedFields,
		addLockedFields: mockAddLockedFields,
		removeLockedFields: mockRemoveLockedFields,
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
const amazonSearchSpy = spyOn(amazonProvider, "search");
const amazonGetByIdSpy = spyOn(amazonProvider, "getById");
const amazonProductUrlSpy = spyOn(amazonProvider, "productUrl");
const ranobedbSearchSpy = spyOn(ranobedbProvider, "search");
const ranobedbGetByIdSpy = spyOn(ranobedbProvider, "getById");

// Restore the real methods so later test files see the actual providers
afterAll(() => {
	amazonSpy.mockRestore();
	ranobedbSpy.mockRestore();
	localSpy.mockRestore();
	amazonSearchSpy.mockRestore();
	amazonGetByIdSpy.mockRestore();
	amazonProductUrlSpy.mockRestore();
	ranobedbSearchSpy.mockRestore();
	ranobedbGetByIdSpy.mockRestore();
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
		).rejects.toThrow(/rate-limiting/);
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
