import { beforeEach, describe, expect, mock, test } from "bun:test";

const findPathsByLibraryId = mock(() => Promise.resolve([]));
const getById = mock(() => Promise.resolve(null));
let entryDataMock = mock((_name: string) => Promise.resolve(undefined));
const closeMock = mock(() => Promise.resolve(undefined));

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

const writeFileMock = mock(() => Promise.resolve(undefined));
const mkdirMock = mock(() => Promise.resolve(undefined));

mock.module("node:fs/promises", () => ({
	default: { writeFile: writeFileMock, mkdir: mkdirMock },
	writeFile: writeFileMock,
	mkdir: mkdirMock,
}));

const { LocalProvider, extractMetadata, extractCover } = await import(
	"../local.provider"
);

describe("local.provider", () => {
	beforeEach(() => {
		findPathsByLibraryId.mockClear();
		getById.mockClear();
		closeMock.mockClear();
		entryDataMock = mock((_name: string) => Promise.resolve(undefined));
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

	test("extractCover prefers properties=cover-image over a fuzzy id match", async () => {
		// Regression: an item whose id merely contains "cover" (e.g. the
		// wraparound "allcover-001") appears before the real cover in the
		// manifest. The EPUB 3 properties="cover-image" signal must win.
		const fetched: string[] = [];
		entryDataMock = mock((name: string) => {
			fetched.push(name);
			return Promise.resolve(Buffer.from("img"));
		});

		const pkgDocumentXml = {
			package: {
				manifest: {
					item: [
						{
							"@_id": "allcover-001",
							"@_media-type": "image/jpeg",
							"@_href": "image/allcover-001.jpg",
						},
						{
							"@_id": "cover",
							"@_media-type": "image/jpeg",
							"@_href": "image/cover.jpg",
							"@_properties": "cover-image",
						},
					],
				},
			},
		};

		const result = await extractCover(
			new MockStreamZipAsync() as unknown as {
				entryData: (name: string) => Promise<Buffer | undefined>;
			},
			pkgDocumentXml,
			"item",
			"book-uuid",
		);

		expect(fetched).toContain("item/image/cover.jpg");
		expect(fetched).not.toContain("item/image/allcover-001.jpg");
		expect(result).toContain("book-uuid.jpg");
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
	});
});
