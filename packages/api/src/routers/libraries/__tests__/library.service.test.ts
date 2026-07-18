import {
	afterAll,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";

// ─── Mocks must be registered before importing the module under test ─────────

// Mock env to prevent validation errors
mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
		SEARCH_PROVIDER: "pgroonga",
	},
}));

// Full logger shape: other test files register child-only logger mocks that
// would otherwise leak into this file when the whole suite runs together.
const serviceLoggerMock = {
	info: mock(() => {}),
	warn: mock(() => {}),
	error: mock(() => {}),
	debug: mock(() => {}),
	child: mock(() => serviceLoggerMock),
};
mock.module("../../../lib/logger", () => ({ logger: serviceLoggerMock }));

// ─── libraryRepository mock ──────────────────────────────────────────────────

const mockFindById = mock(() => Promise.resolve(null));
const mockFindByUuid = mock(() => Promise.resolve(null));
const mockGetIdAndMediaTypeByUuid = mock(
	(): Promise<{ id: number; mediaType: "ebook" | "audiobook" } | null> =>
		Promise.resolve(null),
);
const mockUpdate = mock(() => Promise.resolve(null));
const mockDelete = mock(() => Promise.resolve(false));
const mockAddPath = mock(() => Promise.resolve(null));
const mockFindLibraryIdForPath = mock(() => Promise.resolve(null));
const mockSetPathEnabled = mock(() => Promise.resolve(null));
const mockCreate = mock(() => Promise.resolve({ id: 1 }));
const mockFindByOrganization = mock(
	(): Promise<Array<{ id: number }>> => Promise.resolve([]),
);
const mockFindOverviewByOrganization = mock(
	(): Promise<
		Array<{
			id: number;
			uuid: string;
			name: string | null;
			mediaType: "ebook" | "audiobook";
			bookCount: number;
			previewCovers: string[];
		}>
	> => Promise.resolve([]),
);

// We expose a MockLibraryRepository class so that other tests which import the
// real LibraryRepository class (e.g. local.provider.ts) do not break due to
// mock pollution when this test runs in the same bun process.
class MockLibraryRepository {
	findById = mockFindById;
	findByUuid = mockFindByUuid;
	getIdByUuid = mock(() => Promise.resolve(null));
	getIdAndMediaTypeByUuid = mockGetIdAndMediaTypeByUuid;
	update = mockUpdate;
	delete = mockDelete;
	addPath = mockAddPath;
	findLibraryIdForPath = mockFindLibraryIdForPath;
	setPathEnabled = mockSetPathEnabled;
	create = mockCreate;
	findByOrganization = mockFindByOrganization;
	findOverviewByOrganization = mockFindOverviewByOrganization;
	removePath = mock(() => Promise.resolve(true));
}

mock.module("../library.repository", () => ({
	LibraryRepository: MockLibraryRepository,
	libraryRepository: new MockLibraryRepository(),
}));

// ─── Cascade helper mocks ────────────────────────────────────────────────────

const mockFetchRelatedEntitiesByLibraryId = mock(() =>
	Promise.resolve({ authorIds: [], seriesIds: [] }),
);
const mockFetchRelatedEntitiesByLibraryPathId = mock(() =>
	Promise.resolve({ authorIds: [], seriesIds: [] }),
);
const mockEnqueueBulkEntitySync = mock(() => Promise.resolve());
const mockEnqueueSearchSync = mock(() => Promise.resolve());

mock.module("../../../infrastructure/search/search.document", () => ({
	fetchRelatedEntitiesByLibraryId: mockFetchRelatedEntitiesByLibraryId,
	fetchRelatedEntitiesByLibraryPathId: mockFetchRelatedEntitiesByLibraryPathId,
}));

mock.module("../../../infrastructure/search/search-sync.service", () => ({
	enqueueBulkEntitySync: mockEnqueueBulkEntitySync,
	enqueueSearchSync: mockEnqueueSearchSync,
	enqueueSeriesSync: mock(() => Promise.resolve()),
	enqueueAuthorSync: mock(() => Promise.resolve()),
}));

mock.module("../../../modules/conversion/converter", () => ({
	removeConvertedFile: mock(() => Promise.resolve()),
}));

const mockScanPathLibrary = mock(() => Promise.resolve());
mock.module("../../../modules/scanning/libraryScanner", () => ({
	scanPathLibrary: mockScanPathLibrary,
}));

// Scheduler talks to Redis — stub it so update/delete don't open a connection.
const mockRegisterSchedule = mock(() => Promise.resolve());
const mockUnregisterSchedule = mock(() => Promise.resolve());
mock.module("../../../modules/scanning/scheduled-scan.scheduler", () => ({
	registerLibrarySchedule: mockRegisterSchedule,
	unregisterLibrarySchedule: mockUnregisterSchedule,
	reconcileSchedules: mock(() => Promise.resolve()),
}));

class TaskCancelledError extends Error {}
const mockCreateTask = mock(() => Promise.resolve({ id: "task-1" }));
const mockFinalizeTask = mock(() => Promise.resolve());
const mockGetActiveTasks = mock(
	(): Promise<Array<{ type: string; libraryId: number }>> =>
		Promise.resolve([]),
);
const mockReserve = mock(() => Promise.resolve());
const mockThrowIfTaskCancelled = mock(() => Promise.resolve());
mock.module("../../../modules/taskManager", () => ({
	createTask: mockCreateTask,
	finalizeTask: mockFinalizeTask,
	getActiveTasks: mockGetActiveTasks,
	reserve: mockReserve,
	TaskCancelledError,
	throwIfTaskCancelled: mockThrowIfTaskCancelled,
}));

// The producer queues talk to Redis — stub both.
const mockScheduledScanAdd = mock(() => Promise.resolve());
mock.module(
	"../../../infrastructure/queue/queues/scheduled-scan.queue",
	() => ({
		scheduledScanQueue: { add: mockScheduledScanAdd },
	}),
);
const mockFileEventAddBulk = mock(() => Promise.resolve());
mock.module("../../../infrastructure/queue/queues/file-event.queue", () => ({
	fileEventQueue: { addBulk: mockFileEventAddBulk },
}));
const mockMetadataEnrichAddBulk = mock(() => Promise.resolve());
mock.module(
	"../../../infrastructure/queue/queues/metadata-enrich.queue",
	() => ({
		metadataEnrichQueue: { addBulk: mockMetadataEnrichAddBulk },
	}),
);

// runLibraryScan's finally block dynamically imports this scheduler and calls
// enqueuePostScanRebuild, which talks to Redis via BullMQ. Stub it so the scan
// tests don't open a real connection (which hangs until the 5s test timeout).
const mockEnqueuePostScanRebuild = mock(() => Promise.resolve());
mock.module(
	"../../../modules/recommendations/recommendation.scheduler",
	() => ({
		enqueuePostScanRebuild: mockEnqueuePostScanRebuild,
	}),
);

// Patch the repository singletons in place (module mocks leak across test
// files in the shared bun process and would hide the real repositories from
// their own unit tests).
const { bookRepository } = await import("../../books/book.repository");
const mockGetIdsByLibraryId = spyOn(
	bookRepository,
	"getIdsByLibraryId",
).mockImplementation(() => Promise.resolve([]));
const mockGetIdsByLibraryPathId = spyOn(
	bookRepository,
	"getIdsByLibraryPathId",
).mockImplementation(() => Promise.resolve([]));
const mockListEbookIdsByLibraryAfter = spyOn(
	bookRepository,
	"listEbookIdsByLibraryAfter",
).mockImplementation(
	(): Promise<Array<{ id: number; uuid: string }>> => Promise.resolve([]),
);

const { bookMetadataRepository } = await import(
	"../../books/metadata/metadata.repository"
);
const repositorySpies = [
	mockGetIdsByLibraryId,
	mockGetIdsByLibraryPathId,
	mockListEbookIdsByLibraryAfter,
	spyOn(bookMetadataRepository, "deleteAuthorIfOrphaned").mockImplementation(
		() => Promise.resolve(),
	),
	spyOn(bookMetadataRepository, "deleteSeriesIfOrphaned").mockImplementation(
		() => Promise.resolve(),
	),
];
afterAll(() => {
	for (const spy of repositorySpies) spy.mockRestore();
});

// Filesystem access guard: spy on the singleton (default: accessible) so
// tests don't depend on real paths existing.
const { pathAccess } = await import("../path-access");
const mockAssertAccessible = spyOn(
	pathAccess,
	"assertAccessible",
).mockImplementation(() => Promise.resolve());
repositorySpies.push(mockAssertAccessible);

// ─── Import module under test + error class ──────────────────────────────────

const { BadRequestError, NotFoundError } = await import("../../../errors");
const service = await import("../library.service");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeLibrary(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		name: "Test Library",
		serverId: "org-A",
		isCronWatch: false,
		isPublic: false,
		mediaType: "ebook",
		metadataProviders: ["ranobedb"],
		createdAt: new Date().toISOString(),
		paths: [],
		...overrides,
	};
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("library.service — org-scoped authorization", () => {
	beforeEach(() => {
		mockFindById.mockReset();
		mockFindByUuid.mockReset();
		mockGetIdAndMediaTypeByUuid.mockReset();
		mockGetIdAndMediaTypeByUuid.mockImplementation(() =>
			Promise.resolve({ id: 1, mediaType: "ebook" as const }),
		);
		mockCreate.mockReset();
		mockCreate.mockImplementation(() => Promise.resolve({ id: 1 }));
		mockUpdate.mockReset();
		mockDelete.mockReset();
		mockAddPath.mockReset();
		mockFindLibraryIdForPath.mockReset();
		mockSetPathEnabled.mockReset();
		mockRegisterSchedule.mockReset();
		mockUnregisterSchedule.mockReset();
		mockRegisterSchedule.mockImplementation(() => Promise.resolve());
		mockUnregisterSchedule.mockImplementation(() => Promise.resolve());
		mockCreateTask.mockReset();
		mockCreateTask.mockImplementation(() => Promise.resolve({ id: "task-1" }));
		mockFinalizeTask.mockReset();
		mockFinalizeTask.mockImplementation(() => Promise.resolve());
		mockGetActiveTasks.mockReset();
		mockGetActiveTasks.mockImplementation(() => Promise.resolve([]));
		mockReserve.mockReset();
		mockReserve.mockImplementation(() => Promise.resolve());
		mockThrowIfTaskCancelled.mockReset();
		mockThrowIfTaskCancelled.mockImplementation(() => Promise.resolve());
		mockScheduledScanAdd.mockReset();
		mockScheduledScanAdd.mockImplementation(() => Promise.resolve());
		mockFileEventAddBulk.mockReset();
		mockFileEventAddBulk.mockImplementation(() => Promise.resolve());
		mockListEbookIdsByLibraryAfter.mockReset();
		mockListEbookIdsByLibraryAfter.mockImplementation(() =>
			Promise.resolve([]),
		);
		mockScanPathLibrary.mockReset();
		mockScanPathLibrary.mockImplementation(() => Promise.resolve());
		mockAssertAccessible.mockReset();
		mockAssertAccessible.mockImplementation(() => Promise.resolve());
		mockFetchRelatedEntitiesByLibraryId.mockReset();
		mockGetIdsByLibraryId.mockReset();
		mockFetchRelatedEntitiesByLibraryPathId.mockReset();
		mockGetIdsByLibraryPathId.mockReset();
		// Restore safe defaults after each reset
		mockFetchRelatedEntitiesByLibraryId.mockImplementation(() =>
			Promise.resolve({ authorIds: [], seriesIds: [] }),
		);
		mockGetIdsByLibraryId.mockImplementation(() => Promise.resolve([]));
		mockFetchRelatedEntitiesByLibraryPathId.mockImplementation(() =>
			Promise.resolve({ authorIds: [], seriesIds: [] }),
		);
		mockGetIdsByLibraryPathId.mockImplementation(() => Promise.resolve([]));
	});

	// ─── getLibraryById ──────────────────────────────────────────────────────

	describe("getLibraryById", () => {
		test("returns the library when findById resolves a library", async () => {
			const lib = makeLibrary();
			mockFindById.mockImplementation(() => Promise.resolve(lib));

			const result = await service.getLibraryById(1, "org-A", "ALL");

			expect(result).toEqual(lib);
		});

		test("throws NotFoundError when findById resolves null", async () => {
			mockFindById.mockImplementation(() => Promise.resolve(null));

			await expect(
				service.getLibraryById(1, "org-A", "ALL"),
			).rejects.toBeInstanceOf(NotFoundError);
		});

		test("passes serverId through to libraryRepository.findById", async () => {
			mockFindById.mockImplementation(() => Promise.resolve(makeLibrary()));

			await service.getLibraryById(42, "org-A", "ALL");

			expect(mockFindById).toHaveBeenCalledWith(42, "org-A");
		});

		test("throws NotFoundError (without hitting the db) when the library is not accessible", async () => {
			mockFindById.mockClear();
			await expect(
				service.getLibraryById(5, "org-A", [1, 2, 3]),
			).rejects.toBeInstanceOf(NotFoundError);
			expect(mockFindById).not.toHaveBeenCalled();
		});
	});

	// ─── getLibraries access filtering ───────────────────────────────────────

	describe("getLibraries access filtering", () => {
		test("returns all libraries when access is ALL", async () => {
			mockFindByOrganization.mockImplementation(() =>
				Promise.resolve([{ id: 10 }, { id: 20 }, { id: 30 }]),
			);
			const result = await service.getLibraries("org-A", "ALL");
			expect(result.map((l) => l.id)).toEqual([10, 20, 30]);
		});

		test("filters to the accessible subset", async () => {
			mockFindByOrganization.mockImplementation(() =>
				Promise.resolve([{ id: 10 }, { id: 20 }, { id: 30 }]),
			);
			const result = await service.getLibraries("org-A", [10, 30]);
			expect(result.map((l) => l.id)).toEqual([10, 30]);
		});
	});

	// ─── getLibrariesOverview access filtering ───────────────────────────────

	describe("getLibrariesOverview", () => {
		const overviewRow = (
			id: number,
			overrides: Record<string, unknown> = {},
		) => ({
			id,
			uuid: `uuid-${id}`,
			name: `Lib ${id}`,
			mediaType: "ebook" as const,
			bookCount: id * 10,
			previewCovers: [`cover-${id}.avif`],
			...overrides,
		});

		beforeEach(() => {
			mockFindOverviewByOrganization.mockReset();
		});

		test("returns every library (without internal id) when access is ALL", async () => {
			mockFindOverviewByOrganization.mockImplementation(() =>
				Promise.resolve([overviewRow(10), overviewRow(20)]),
			);

			const result = await service.getLibrariesOverview("org-A", "ALL");

			expect(mockFindOverviewByOrganization).toHaveBeenCalledWith("org-A");
			expect(result).toEqual([
				{
					uuid: "uuid-10",
					name: "Lib 10",
					mediaType: "ebook",
					bookCount: 100,
					previewCovers: ["cover-10.avif"],
				},
				{
					uuid: "uuid-20",
					name: "Lib 20",
					mediaType: "ebook",
					bookCount: 200,
					previewCovers: ["cover-20.avif"],
				},
			]);
		});

		test("filters to the accessible subset", async () => {
			mockFindOverviewByOrganization.mockImplementation(() =>
				Promise.resolve([overviewRow(10), overviewRow(20), overviewRow(30)]),
			);

			const result = await service.getLibrariesOverview("org-A", [10, 30]);

			expect(result.map((l) => l.uuid)).toEqual(["uuid-10", "uuid-30"]);
		});

		test("returns an empty list when nothing is accessible", async () => {
			mockFindOverviewByOrganization.mockImplementation(() =>
				Promise.resolve([overviewRow(10)]),
			);

			const result = await service.getLibrariesOverview("org-A", []);

			expect(result).toEqual([]);
		});
	});

	// ─── createLibrary provider defaults ─────────────────────────────────────

	describe("createLibrary provider defaults", () => {
		test("defaults to ebook providers when none are given", async () => {
			await service.createLibrary({ name: "Books" }, "org-A");

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					metadataProviders: [
						"ranobedb",
						"amazon",
						"googlebooks",
						"openlibrary",
						"goodreads",
						"hardcover",
						"comicvine",
					],
				}),
				"org-A",
			);
		});

		test("defaults to audiobook providers for audiobook libraries", async () => {
			await service.createLibrary(
				{ name: "Audio", mediaType: "audiobook" },
				"org-A",
			);

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({ metadataProviders: ["audible", "itunes"] }),
				"org-A",
			);
		});

		test("keeps an explicit provider list", async () => {
			await service.createLibrary(
				{
					name: "Audio",
					mediaType: "audiobook",
					metadataProviders: ["itunes", "audible"],
				},
				"org-A",
			);

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({ metadataProviders: ["itunes", "audible"] }),
				"org-A",
			);
		});
	});

	// ─── createLibrary / addPath folder validation ───────────────────────────

	describe("folder accessibility validation", () => {
		test("createLibrary rejects when a folder is not accessible", async () => {
			mockAssertAccessible.mockImplementation(() =>
				Promise.reject(
					new BadRequestError("Folder is not accessible on the server: /bad"),
				),
			);

			await expect(
				service.createLibrary({ name: "Rota", paths: ["/bad"] }, "org-A"),
			).rejects.toBeInstanceOf(BadRequestError);

			expect(mockAssertAccessible).toHaveBeenCalledWith(["/bad"]);
			// Nothing is persisted and no scan is started for a rejected library.
			expect(mockCreate).not.toHaveBeenCalled();
			expect(mockScheduledScanAdd).not.toHaveBeenCalled();
		});

		test("createLibrary without folders skips nothing and succeeds", async () => {
			mockCreate.mockImplementation(() =>
				Promise.resolve({ id: 3, name: "Vacía", paths: [] }),
			);

			await service.createLibrary({ name: "Vacía" }, "org-A");

			expect(mockAssertAccessible).toHaveBeenCalledWith([]);
			expect(mockCreate).toHaveBeenCalled();
		});

		test("addPath rejects an inaccessible folder without persisting it", async () => {
			mockFindByUuid.mockImplementation(() => Promise.resolve(makeLibrary()));
			mockAssertAccessible.mockImplementation(() =>
				Promise.reject(
					new BadRequestError("Folder is not accessible on the server: /bad"),
				),
			);

			await expect(
				service.addPath("lib-uuid", "/bad", "org-A"),
			).rejects.toBeInstanceOf(BadRequestError);
			expect(mockAddPath).not.toHaveBeenCalled();
		});
	});

	// ─── createLibrary initial scan ──────────────────────────────────────────

	describe("createLibrary initial scan", () => {
		test("starts a scan when the library is created with enabled folders", async () => {
			mockCreate.mockImplementation(() =>
				Promise.resolve({
					id: 7,
					name: "Novelas",
					paths: [{ id: 1, path: "/books", libraryId: 7, isEnabled: true }],
				}),
			);
			mockCreateTask.mockImplementation(() => Promise.resolve({ id: "t-new" }));

			await service.createLibrary(
				{ name: "Novelas", paths: ["/books"] },
				"org-A",
				"user-1",
			);

			expect(mockCreateTask).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "library-scan",
					serverId: "org-A",
					userId: "user-1",
					libraryId: 7,
				}),
			);
			expect(mockScheduledScanAdd).toHaveBeenCalledWith("library-scan", {
				op: "scan",
				libraryId: 7,
				serverId: "org-A",
				taskId: "t-new",
			});
		});

		test("does not scan when the library has no folders", async () => {
			mockCreate.mockImplementation(() =>
				Promise.resolve({ id: 8, name: "Vacía", paths: [] }),
			);

			await service.createLibrary({ name: "Vacía" }, "org-A", "user-1");

			expect(mockCreateTask).not.toHaveBeenCalled();
			expect(mockScheduledScanAdd).not.toHaveBeenCalled();
		});

		test("creation still succeeds when the initial scan cannot be enqueued", async () => {
			mockCreate.mockImplementation(() =>
				Promise.resolve({
					id: 9,
					name: "Novelas",
					paths: [{ id: 1, path: "/books", libraryId: 9, isEnabled: true }],
				}),
			);
			mockScheduledScanAdd.mockImplementation(() =>
				Promise.reject(new Error("redis down")),
			);

			const created = await service.createLibrary(
				{ name: "Novelas", paths: ["/books"] },
				"org-A",
				"user-1",
			);

			expect(created).toMatchObject({ id: 9 });
		});
	});

	// ─── updateLibrary ───────────────────────────────────────────────────────

	describe("updateLibrary", () => {
		test("throws NotFoundError when the library uuid is not owned", async () => {
			mockGetIdAndMediaTypeByUuid.mockImplementation(() =>
				Promise.resolve(null),
			);

			await expect(
				service.updateLibrary("lib-uuid", { name: "New Name" }, "org-A"),
			).rejects.toBeInstanceOf(NotFoundError);
			expect(mockUpdate).not.toHaveBeenCalled();
		});

		test("throws NotFoundError when update resolves null", async () => {
			mockUpdate.mockImplementation(() => Promise.resolve(null));

			await expect(
				service.updateLibrary("lib-uuid", { name: "New Name" }, "org-A"),
			).rejects.toBeInstanceOf(NotFoundError);
		});

		test("passes serverId through to libraryRepository.update", async () => {
			const lib = makeLibrary({ name: "Updated" });
			mockUpdate.mockImplementation(() => Promise.resolve(lib));

			await service.updateLibrary("lib-uuid", { name: "Updated" }, "org-A");

			expect(mockUpdate).toHaveBeenCalledWith(1, { name: "Updated" }, "org-A");
		});

		test("returns the updated library on success", async () => {
			const lib = makeLibrary({ name: "Updated" });
			mockUpdate.mockImplementation(() => Promise.resolve(lib));

			const result = await service.updateLibrary(
				"lib-uuid",
				{ name: "Updated" },
				"org-A",
			);

			expect(result).toEqual(lib);
		});

		test("registers a scan schedule when isCronWatch is on", async () => {
			const lib = makeLibrary({ isCronWatch: true, scanIntervalMinutes: 720 });
			mockUpdate.mockImplementation(() => Promise.resolve(lib));

			await service.updateLibrary(
				"lib-uuid",
				{ isCronWatch: true, scanIntervalMinutes: 720 },
				"org-A",
			);

			expect(mockRegisterSchedule).toHaveBeenCalledWith(1, "org-A", 720);
		});

		test("clears the schedule (interval null) when isCronWatch is off", async () => {
			const lib = makeLibrary({ isCronWatch: false, scanIntervalMinutes: 720 });
			mockUpdate.mockImplementation(() => Promise.resolve(lib));

			await service.updateLibrary("lib-uuid", { isCronWatch: false }, "org-A");

			expect(mockRegisterSchedule).toHaveBeenCalledWith(1, "org-A", null);
		});

		test("rejects audiobook providers on an ebook library", async () => {
			mockGetIdAndMediaTypeByUuid.mockImplementation(() =>
				Promise.resolve({ id: 1, mediaType: "ebook" as const }),
			);

			await expect(
				service.updateLibrary(
					"lib-uuid",
					{ metadataProviders: ["audible", "itunes"] },
					"org-A",
				),
			).rejects.toBeInstanceOf(BadRequestError);
			expect(mockUpdate).not.toHaveBeenCalled();
		});

		test("rejects ebook providers on an audiobook library", async () => {
			mockGetIdAndMediaTypeByUuid.mockImplementation(() =>
				Promise.resolve({ id: 1, mediaType: "audiobook" as const }),
			);

			await expect(
				service.updateLibrary(
					"lib-uuid",
					{ metadataProviders: ["ranobedb"] },
					"org-A",
				),
			).rejects.toBeInstanceOf(BadRequestError);
			expect(mockUpdate).not.toHaveBeenCalled();
		});

		test("accepts audiobook providers on an audiobook library", async () => {
			mockGetIdAndMediaTypeByUuid.mockImplementation(() =>
				Promise.resolve({ id: 1, mediaType: "audiobook" as const }),
			);
			const lib = makeLibrary({ mediaType: "audiobook" });
			mockUpdate.mockImplementation(() => Promise.resolve(lib));

			await service.updateLibrary(
				"lib-uuid",
				{ metadataProviders: ["itunes", "audible"] },
				"org-A",
			);

			expect(mockUpdate).toHaveBeenCalledWith(
				1,
				{ metadataProviders: ["itunes", "audible"] },
				"org-A",
			);
		});
	});

	// ─── setPathEnabled ──────────────────────────────────────────────────────

	describe("setPathEnabled", () => {
		test("throws NotFoundError when the path is not owned by the org", async () => {
			mockFindLibraryIdForPath.mockImplementation(() => Promise.resolve(null));

			await expect(
				service.setPathEnabled(7, false, "org-A"),
			).rejects.toBeInstanceOf(NotFoundError);
			expect(mockSetPathEnabled).not.toHaveBeenCalled();
		});

		test("updates the flag when the path is owned", async () => {
			mockFindLibraryIdForPath.mockImplementation(() => Promise.resolve(1));
			const updated = { id: 7, libraryId: 1, path: "/books", isEnabled: false };
			mockSetPathEnabled.mockImplementation(() => Promise.resolve(updated));

			const result = await service.setPathEnabled(7, false, "org-A");

			expect(mockSetPathEnabled).toHaveBeenCalledWith(7, false);
			expect(result).toEqual(updated);
		});
	});

	// ─── deleteLibrary ───────────────────────────────────────────────────────

	describe("deleteLibrary", () => {
		test("throws NotFoundError (without cascade) when findByUuid resolves null", async () => {
			mockFindByUuid.mockImplementation(() => Promise.resolve(null));

			await expect(
				service.deleteLibrary("lib-uuid", "org-A"),
			).rejects.toBeInstanceOf(NotFoundError);

			// Cascade helpers must NOT have been called
			expect(mockFetchRelatedEntitiesByLibraryId).not.toHaveBeenCalled();
			expect(mockGetIdsByLibraryId).not.toHaveBeenCalled();
		});

		test("runs cascade and succeeds when findByUuid resolves a library", async () => {
			const lib = makeLibrary();
			mockFindByUuid.mockImplementation(() => Promise.resolve(lib));
			mockDelete.mockImplementation(() => Promise.resolve(true));

			const result = await service.deleteLibrary("lib-uuid", "org-A");

			expect(result).toEqual({ success: true });
			expect(mockFetchRelatedEntitiesByLibraryId).toHaveBeenCalled();
			expect(mockUnregisterSchedule).toHaveBeenCalledWith(1);
		});
	});

	// ─── scanLibrary ─────────────────────────────────────────────────────────

	describe("scanLibrary", () => {
		test("throws NotFoundError when findByUuid resolves null", async () => {
			mockFindByUuid.mockImplementation(() => Promise.resolve(null));

			await expect(
				service.scanLibrary("lib-uuid", "org-A"),
			).rejects.toBeInstanceOf(NotFoundError);
		});

		test("passes serverId to findByUuid", async () => {
			// Library with a configured path so scan proceeds
			const lib = makeLibrary({
				paths: [{ id: 10, path: "/books", libraryId: 1, isEnabled: true }],
			});
			mockFindByUuid.mockImplementation(() => Promise.resolve(lib));
			mockCreateTask.mockImplementation(() => Promise.resolve({ id: "t-1" }));

			await service.scanLibrary("lib-uuid", "org-A");

			expect(mockFindByUuid).toHaveBeenCalledWith("lib-uuid", "org-A");
		});

		test("creates the task and enqueues a producer job instead of scanning inline", async () => {
			mockScanPathLibrary.mockClear();
			const lib = makeLibrary({
				paths: [{ id: 10, path: "/books", libraryId: 1, isEnabled: true }],
			});
			mockFindByUuid.mockImplementation(() => Promise.resolve(lib));
			mockCreateTask.mockImplementation(() => Promise.resolve({ id: "t-2" }));

			await service.scanLibrary("lib-uuid", "org-A");
			await new Promise((r) => setTimeout(r, 0));

			expect(mockScheduledScanAdd).toHaveBeenCalledWith("library-scan", {
				op: "scan",
				libraryId: 1,
				serverId: "org-A",
				taskId: "t-2",
			});
			// The heavy work must NOT run in the request path.
			expect(mockScanPathLibrary).not.toHaveBeenCalled();
		});

		test("rejects when a scan of this library is already running", async () => {
			const lib = makeLibrary({
				paths: [{ id: 10, path: "/books", libraryId: 1, isEnabled: true }],
			});
			mockFindByUuid.mockImplementation(() => Promise.resolve(lib));
			mockGetActiveTasks.mockImplementation(() =>
				Promise.resolve([{ type: "library-scan", libraryId: 1 }]),
			);

			await expect(
				service.scanLibrary("lib-uuid", "org-A"),
			).rejects.toBeInstanceOf(BadRequestError);
			expect(mockCreateTask).not.toHaveBeenCalled();
			expect(mockScheduledScanAdd).not.toHaveBeenCalled();
		});

		test("throws when all paths are disabled", async () => {
			const lib = makeLibrary({
				paths: [{ id: 13, path: "/off", libraryId: 1, isEnabled: false }],
			});
			mockFindByUuid.mockImplementation(() => Promise.resolve(lib));

			await expect(service.scanLibrary("lib-uuid", "org-A")).rejects.toThrow();
		});
	});

	// ─── runLibraryScan (worker-side executor) ───────────────────────────────

	describe("runLibraryScan", () => {
		test("scans enabled paths and skips disabled ones", async () => {
			mockScanPathLibrary.mockClear();
			const lib = makeLibrary({
				paths: [
					{ id: 10, path: "/on", libraryId: 1, isEnabled: true },
					{ id: 11, path: "/off", libraryId: 1, isEnabled: false },
					{ id: 12, path: "/legacy", libraryId: 1, isEnabled: null },
				],
			});
			mockFindById.mockImplementation(() => Promise.resolve(lib));

			await service.runLibraryScan({
				libraryId: 1,
				serverId: "org-A",
				taskId: "t-3",
			});

			const scannedPaths = mockScanPathLibrary.mock.calls.map(
				(c: unknown[]) => c[0],
			);
			expect(scannedPaths).toContain("/on");
			expect(scannedPaths).toContain("/legacy");
			expect(scannedPaths).not.toContain("/off");
			expect(mockFinalizeTask).toHaveBeenCalledWith("t-3");
		});

		test("creates its own task for scheduled runs (no taskId)", async () => {
			mockScanPathLibrary.mockClear();
			const lib = makeLibrary({
				paths: [{ id: 10, path: "/books", libraryId: 1, isEnabled: true }],
			});
			mockFindById.mockImplementation(() => Promise.resolve(lib));
			mockCreateTask.mockImplementation(() =>
				Promise.resolve({ id: "t-sched" }),
			);

			await service.runLibraryScan({ libraryId: 1, serverId: "org-A" });

			expect(mockCreateTask).toHaveBeenCalled();
			expect(mockScanPathLibrary).toHaveBeenCalledWith(
				"/books",
				1,
				10,
				"t-sched",
				"ebook",
			);
			expect(mockFinalizeTask).toHaveBeenCalledWith("t-sched");
		});

		test("finalizes the task when the library vanished before the job ran", async () => {
			mockScanPathLibrary.mockClear();
			mockFindById.mockImplementation(() => Promise.resolve(null));

			await service.runLibraryScan({
				libraryId: 1,
				serverId: "org-A",
				taskId: "t-gone",
			});

			expect(mockScanPathLibrary).not.toHaveBeenCalled();
			expect(mockFinalizeTask).toHaveBeenCalledWith("t-gone");
		});

		test("stops at the first cancelled path, skips the rest, still finalizes", async () => {
			mockScanPathLibrary.mockClear();
			const lib = makeLibrary({
				paths: [
					{ id: 10, path: "/a", libraryId: 1, isEnabled: true },
					{ id: 11, path: "/b", libraryId: 1, isEnabled: true },
				],
			});
			mockFindById.mockImplementation(() => Promise.resolve(lib));
			mockScanPathLibrary.mockImplementation(() =>
				Promise.reject(new TaskCancelledError("t-4")),
			);

			// A cancellation is a clean stop, not a job failure.
			await service.runLibraryScan({
				libraryId: 1,
				serverId: "org-A",
				taskId: "t-4",
			});

			expect(mockScanPathLibrary).toHaveBeenCalledTimes(1);
			expect(mockFinalizeTask).toHaveBeenCalledWith("t-4");
		});

		test("a path error does not stop the remaining paths", async () => {
			mockScanPathLibrary.mockClear();
			const lib = makeLibrary({
				paths: [
					{ id: 10, path: "/a", libraryId: 1, isEnabled: true },
					{ id: 11, path: "/b", libraryId: 1, isEnabled: true },
				],
			});
			mockFindById.mockImplementation(() => Promise.resolve(lib));
			mockScanPathLibrary
				.mockImplementationOnce(() => Promise.reject(new Error("disk error")))
				.mockImplementationOnce(() => Promise.resolve());

			await service.runLibraryScan({
				libraryId: 1,
				serverId: "org-A",
				taskId: "t-5",
			});

			expect(mockScanPathLibrary).toHaveBeenCalledTimes(2);
			expect(mockFinalizeTask).toHaveBeenCalledWith("t-5");
		});
	});

	// ─── runLibraryReprocess (worker-side executor) ──────────────────────────

	describe("runLibraryReprocess", () => {
		test("reserves and enqueues reprocess jobs per batch, then finalizes", async () => {
			mockListEbookIdsByLibraryAfter
				.mockImplementationOnce(() =>
					Promise.resolve([
						{ id: 1, uuid: "u1" },
						{ id: 2, uuid: "u2" },
					]),
				)
				.mockImplementationOnce(() => Promise.resolve([]));

			await service.runLibraryReprocess({ libraryId: 1, taskId: "t-6" });

			expect(mockReserve).toHaveBeenCalledWith("t-6", 2);
			expect(mockFileEventAddBulk).toHaveBeenCalledTimes(1);
			const jobs = mockFileEventAddBulk.mock.calls[0]?.[0] as Array<{
				data: Record<string, unknown>;
			}>;
			expect(jobs.map((j) => j.data)).toEqual([
				{
					action: "reprocess",
					bookId: 1,
					uuid: "u1",
					libraryId: 1,
					taskId: "t-6",
				},
				{
					action: "reprocess",
					bookId: 2,
					uuid: "u2",
					libraryId: 1,
					taskId: "t-6",
				},
			]);
			expect(mockFinalizeTask).toHaveBeenCalledWith("t-6");
		});

		test("stops enqueuing when the task is cancelled mid-loop", async () => {
			mockListEbookIdsByLibraryAfter.mockImplementation(() =>
				Promise.resolve([{ id: 1, uuid: "u1" }]),
			);
			// First checkpoint passes, second one (next batch) throws.
			mockThrowIfTaskCancelled
				.mockImplementationOnce(() => Promise.resolve())
				.mockImplementationOnce(() =>
					Promise.reject(new TaskCancelledError("t-7")),
				);

			await service.runLibraryReprocess({ libraryId: 1, taskId: "t-7" });

			expect(mockFileEventAddBulk).toHaveBeenCalledTimes(1);
			expect(mockFinalizeTask).toHaveBeenCalledWith("t-7");
		});
	});

	// ─── enrichLibrary (API-side producer) ───────────────────────────────────

	describe("enrichLibrary", () => {
		test("rejects audiobook libraries", async () => {
			mockFindByUuid.mockImplementation(() =>
				Promise.resolve(makeLibrary({ mediaType: "audiobook" })),
			);

			await expect(
				service.enrichLibrary("lib-uuid", "org-A"),
			).rejects.toBeInstanceOf(BadRequestError);
		});

		test("rejects when a metadata refresh is already running for this library", async () => {
			mockFindByUuid.mockImplementation(() => Promise.resolve(makeLibrary()));
			mockGetActiveTasks.mockImplementationOnce(() =>
				Promise.resolve([{ type: "library-enrich", libraryId: 1 }]),
			);

			await expect(
				service.enrichLibrary("lib-uuid", "org-A"),
			).rejects.toBeInstanceOf(BadRequestError);
		});

		test("creates the task and enqueues the enrich op on the scheduled-scan queue", async () => {
			mockScheduledScanAdd.mockClear();
			mockFindByUuid.mockImplementation(() => Promise.resolve(makeLibrary()));
			mockCreateTask.mockImplementation(() => Promise.resolve({ id: "t-e1" }));

			const result = await service.enrichLibrary("lib-uuid", "org-A", "user-1");

			expect(result.success).toBe(true);
			expect(mockCreateTask).toHaveBeenCalledWith(
				expect.objectContaining({ type: "library-enrich", libraryId: 1 }),
			);
			expect(mockScheduledScanAdd).toHaveBeenCalledWith("library-enrich", {
				op: "enrich",
				libraryId: 1,
				serverId: "org-A",
				taskId: "t-e1",
			});
		});
	});

	// ─── runLibraryEnrich (worker-side executor) ─────────────────────────────

	describe("runLibraryEnrich", () => {
		test("fans out refresh-enrich jobs per batch, then finalizes", async () => {
			mockMetadataEnrichAddBulk.mockClear();
			mockListEbookIdsByLibraryAfter
				.mockImplementationOnce(() =>
					Promise.resolve([
						{ id: 1, uuid: "u1" },
						{ id: 2, uuid: "u2" },
					]),
				)
				.mockImplementationOnce(() => Promise.resolve([]));

			await service.runLibraryEnrich({ libraryId: 1, taskId: "t-e2" });

			expect(mockReserve).toHaveBeenCalledWith("t-e2", 2);
			const jobs = mockMetadataEnrichAddBulk.mock.calls[0]?.[0] as Array<{
				name: string;
				data: Record<string, unknown>;
			}>;
			expect(jobs.map((j) => j.name)).toEqual(["enrich-book", "enrich-book"]);
			expect(jobs.map((j) => j.data)).toEqual([
				{ bookId: 1, uuid: "u1", taskId: "t-e2", refresh: true },
				{ bookId: 2, uuid: "u2", taskId: "t-e2", refresh: true },
			]);
			expect(mockFinalizeTask).toHaveBeenCalledWith("t-e2");
		});

		test("stops enqueuing when the task is cancelled mid-loop", async () => {
			mockMetadataEnrichAddBulk.mockClear();
			mockListEbookIdsByLibraryAfter.mockImplementation(() =>
				Promise.resolve([{ id: 1, uuid: "u1" }]),
			);
			mockThrowIfTaskCancelled
				.mockImplementationOnce(() => Promise.resolve())
				.mockImplementationOnce(() =>
					Promise.reject(new TaskCancelledError("t-e3")),
				);

			await service.runLibraryEnrich({ libraryId: 1, taskId: "t-e3" });

			expect(mockMetadataEnrichAddBulk).toHaveBeenCalledTimes(1);
			expect(mockFinalizeTask).toHaveBeenCalledWith("t-e3");
		});
	});

	// ─── addPath ─────────────────────────────────────────────────────────────

	describe("addPath", () => {
		test("throws NotFoundError when findByUuid resolves null", async () => {
			mockFindByUuid.mockImplementation(() => Promise.resolve(null));

			await expect(
				service.addPath("lib-uuid", "/books", "org-A"),
			).rejects.toBeInstanceOf(NotFoundError);
		});

		test("does NOT call addPath on repository when library is not found", async () => {
			mockFindByUuid.mockImplementation(() => Promise.resolve(null));

			await expect(
				service.addPath("lib-uuid", "/books", "org-A"),
			).rejects.toBeInstanceOf(NotFoundError);

			expect(mockAddPath).not.toHaveBeenCalled();
		});

		test("calls repository.addPath when library is found", async () => {
			const lib = makeLibrary();
			mockFindByUuid.mockImplementation(() => Promise.resolve(lib));
			const newPath = {
				id: 5,
				libraryId: 1,
				path: "/books",
				isEnabled: true,
			};
			mockAddPath.mockImplementation(() => Promise.resolve(newPath));

			const result = await service.addPath("lib-uuid", "/books", "org-A");

			expect(mockAddPath).toHaveBeenCalledWith({
				libraryId: 1,
				path: "/books",
				isEnabled: true,
			});
			expect(result).toEqual(newPath);
		});
	});

	// ─── removePath ──────────────────────────────────────────────────────────

	describe("removePath", () => {
		test("throws NotFoundError when findLibraryIdForPath resolves null", async () => {
			mockFindLibraryIdForPath.mockImplementation(() => Promise.resolve(null));

			await expect(service.removePath(99, "org-A")).rejects.toBeInstanceOf(
				NotFoundError,
			);
		});

		test("does NOT run cascade cleanup when path is not found", async () => {
			mockFindLibraryIdForPath.mockImplementation(() => Promise.resolve(null));

			await expect(service.removePath(99, "org-A")).rejects.toBeInstanceOf(
				NotFoundError,
			);

			expect(mockFetchRelatedEntitiesByLibraryPathId).not.toHaveBeenCalled();
			expect(mockGetIdsByLibraryPathId).not.toHaveBeenCalled();
		});
	});
});
