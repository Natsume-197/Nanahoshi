import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const findPathsByLibraryId = mock(() => Promise.resolve([]));
const getById = mock(() => Promise.resolve(null));
let entryDataMock = mock((_name: string) => Promise.resolve(undefined));
const closeMock = mock(() => Promise.resolve(undefined));
const warnMock = mock(() => {});
const originalWarn = console.warn;

class MockLibraryRepository {
	findPathsByLibraryId = findPathsByLibraryId;
}

class MockStreamZipAsync {
	entryData(name: string) {
		return entryDataMock(name);
	}

	close() {
		return closeMock();
	}
}

mock.module("../../../../libraries/library.repository", () => ({
	LibraryRepository: MockLibraryRepository,
}));

mock.module("../../../book.repository", () => ({
	bookRepository: {
		getById,
	},
}));

mock.module("node-stream-zip", () => ({
	default: {
		async: MockStreamZipAsync,
	},
}));

const { LocalProvider, extractMetadata } = await import("../local.provider");

describe("local.provider", () => {
	beforeEach(() => {
		findPathsByLibraryId.mockClear();
		getById.mockClear();
		closeMock.mockClear();
		warnMock.mockClear();
		entryDataMock = mock((_name: string) => Promise.resolve(undefined));
		console.warn = warnMock as unknown as typeof console.warn;
	});

	afterAll(() => {
		console.warn = originalWarn;
	});

	test("extractMetadata reads unprefixed dc fields when XML namespaces are removed", () => {
		const metadata = extractMetadata({
			package: {
				metadata: {
					identifier: "urn:uuid:test-book",
					title: "Namespace-Free EPUB",
					language: "es",
					creator: [
						{
							"#text": "Autor Uno",
						},
						"Autor Dos",
					],
					date: "2024-01-01",
					description: "Descripcion",
					publisher: "Editorial",
				},
			},
		});

		expect(metadata.identifier).toBe("urn:uuid:test-book");
		expect(metadata.title).toBe("Namespace-Free EPUB");
		expect(metadata.language).toBe("es");
		expect(metadata.creator).toEqual(["Autor Uno", "Autor Dos"]);
		expect(metadata.date).toBe("2024-01-01");
		expect(metadata.description).toBe("Descripcion");
		expect(metadata.publisher).toBe("Editorial");
	});

	test("extractMetadata tolerates missing identifier", () => {
		const metadata = extractMetadata({
			package: {
				metadata: {
					title: "Sin identificador",
					language: "es",
				},
			},
		});

		expect(metadata.identifier).toBe("");
		expect(metadata.title).toBe("Sin identificador");
		expect(metadata.language).toBe("es");
	});

	test("getMetadata returns an empty object when epub parsing fails", async () => {
		const provider = new LocalProvider();
		(
			provider as unknown as {
				getBookFilePath: (bookId: number) => Promise<string | null>;
			}
		).getBookFilePath = mock(() => Promise.resolve("/tmp/invalid.epub"));

		const metadata = await provider.getMetadata({
			bookId: 42,
			uuid: "book-uuid",
		});

		expect(metadata).toEqual({});
		expect(closeMock).toHaveBeenCalledTimes(1);
		expect(warnMock).toHaveBeenCalledTimes(1);
	});
});
