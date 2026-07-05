import { beforeEach, describe, expect, mock, test } from "bun:test";

// ─── Mocks must be registered before importing the module under test ─────────

// Mock env to prevent validation errors
mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
		SEARCH_PROVIDER: "pgroonga",
	},
}));

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

const mockCreateTask = mock(() => Promise.resolve({ id: "task-1" }));
const mockFinalizeTask = mock(() => Promise.resolve());
mock.module("../../../modules/taskManager", () => ({
	createTask: mockCreateTask,
	finalizeTask: mockFinalizeTask,
}));

const mockGetIdsByLibraryId = mock(() => Promise.resolve([]));
const mockGetIdsByLibraryPathId = mock(() => Promise.resolve([]));
mock.module("../../books/book.repository", () => ({
	bookRepository: {
		getIdsByLibraryId: mockGetIdsByLibraryId,
		getIdsByLibraryPathId: mockGetIdsByLibraryPathId,
	},
}));

mock.module("../../books/metadata/metadata.repository", () => ({
	bookMetadataRepository: {
		deleteAuthorIfOrphaned: mock(() => Promise.resolve()),
		deleteSeriesIfOrphaned: mock(() => Promise.resolve()),
	},
}));

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

	// ─── createLibrary provider defaults ─────────────────────────────────────

	describe("createLibrary provider defaults", () => {
		test("defaults to ebook providers when none are given", async () => {
			await service.createLibrary({ name: "Books" }, "org-A");

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({ metadataProviders: ["ranobedb", "amazon"] }),
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

		test("scans enabled paths and skips disabled ones", async () => {
			mockScanPathLibrary.mockClear();
			const lib = makeLibrary({
				paths: [
					{ id: 10, path: "/on", libraryId: 1, isEnabled: true },
					{ id: 11, path: "/off", libraryId: 1, isEnabled: false },
					{ id: 12, path: "/legacy", libraryId: 1, isEnabled: null },
				],
			});
			mockFindByUuid.mockImplementation(() => Promise.resolve(lib));
			mockCreateTask.mockImplementation(() => Promise.resolve({ id: "t-2" }));

			await service.scanLibrary("lib-uuid", "org-A");
			// The scan loop runs async after returning; let it flush.
			await new Promise((r) => setTimeout(r, 0));

			const scannedPaths = mockScanPathLibrary.mock.calls.map(
				(c: unknown[]) => c[0],
			);
			expect(scannedPaths).toContain("/on");
			expect(scannedPaths).toContain("/legacy");
			expect(scannedPaths).not.toContain("/off");
		});

		test("throws when all paths are disabled", async () => {
			const lib = makeLibrary({
				paths: [{ id: 13, path: "/off", libraryId: 1, isEnabled: false }],
			});
			mockFindByUuid.mockImplementation(() => Promise.resolve(lib));

			await expect(service.scanLibrary("lib-uuid", "org-A")).rejects.toThrow();
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
