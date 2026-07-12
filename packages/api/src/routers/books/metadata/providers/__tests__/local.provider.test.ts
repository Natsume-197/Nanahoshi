import {
	afterAll,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";

let entryDataMock = mock((_name: string) => Promise.resolve(undefined));
const closeMock = mock(() => Promise.resolve(undefined));

class MockStreamZipAsync {
	entryData(name: string) {
		return entryDataMock(name);
	}

	close() {
		return closeMock();
	}
}

// The real repositories pull in db/env at import time — stub those modules,
// then patch the repository singletons/prototypes in place (module mocks of
// first-party repositories leak across test files in the shared bun process).
mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));
mock.module("@nanahoshi-v2/db", () => ({ db: {} }));

const { LibraryRepository } = await import(
	"../../../../libraries/library.repository"
);
const findPathsByLibraryId = spyOn(
	LibraryRepository.prototype,
	"findPathsByLibraryId",
).mockImplementation(() =>
	Promise.resolve(
		[] as Awaited<
			ReturnType<typeof LibraryRepository.prototype.findPathsByLibraryId>
		>,
	),
);
const { bookRepository } = await import("../../../book.repository");
const getById = spyOn(bookRepository, "getById").mockImplementation(() =>
	Promise.resolve(null as Awaited<ReturnType<typeof bookRepository.getById>>),
);
afterAll(() => {
	findPathsByLibraryId.mockRestore();
	getById.mockRestore();
});

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

const {
	LocalProvider,
	extractMetadata,
	extractCover,
	extractEmbeddedIdentifiers,
} = await import("../local.provider");

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

	test("extractMetadata maps a MOBI-ASIN identifier to asin (calibre EPUB shape)", () => {
		// Same shape as a real calibre OPF: uuid + MOBI-ASIN identifiers.
		const metadata = extractMetadata({
			package: {
				metadata: {
					identifier: [
						{ "#text": "B08R8G4XMQ", "@_scheme": "MOBI-ASIN" },
						{
							"#text": "910f3001-b6df-4194-b087-f21015ec3537",
							"@_id": "uuid_id",
							"@_scheme": "uuid",
						},
					],
					title:
						"経験をスキルにする万能な能力を手に入れて、最強の探索者になりました1",
					language: "ja",
				},
			},
		});

		expect(metadata.asin).toBe("B08R8G4XMQ");
		expect(metadata.isbn10).toBeNull();
		expect(metadata.isbn13).toBeNull();
		// uuid keeps winning as the EPUB uniqueId
		expect(metadata.identifier).toBe("910f3001-b6df-4194-b087-f21015ec3537");
	});

	describe("extractEmbeddedIdentifiers", () => {
		test("accepts a checksum-valid ISBN-13 from any node, hyphens and urn: included", () => {
			expect(extractEmbeddedIdentifiers("urn:isbn:978-4-04-073127-8")).toEqual({
				asin: null,
				isbn10: null,
				isbn13: "9784040731278",
				embeddedUid: null,
			});
			// numeric #text (fast-xml-parser parses digit-only text as number)
			expect(extractEmbeddedIdentifiers([{ "#text": 9784040731278 }])).toEqual({
				asin: null,
				isbn10: null,
				isbn13: "9784040731278",
				embeddedUid: null,
			});
		});

		test("accepts ISBN-10 only when the scheme labels it", () => {
			const labeled = extractEmbeddedIdentifiers([
				{ "#text": "4040731271", "@_scheme": "ISBN" },
			]);
			expect(labeled.isbn10).toBe("4040731271");

			// A bare 10-char value is too ambiguous to trust.
			const bare = extractEmbeddedIdentifiers(["4040731271"]);
			expect(bare.isbn10).toBeNull();
		});

		test("rejects invalid checksums, placeholders and per-copy ids", () => {
			expect(
				extractEmbeddedIdentifiers([
					{ "#text": "0000000000", "@_scheme": "ISBN" }, // placeholder
					"urn:uuid:e676c613-51a8-41f4-9cfc-4d8a9929887c",
					"calibre:12345",
				]),
			).toEqual({ asin: null, isbn10: null, isbn13: null, embeddedUid: null });

			// A bad-checksum ISBN is not an ISBN, but it IS a stable opaque id:
			// copies of the same source share it, so it degrades to embeddedUid.
			expect(
				extractEmbeddedIdentifiers([
					{ "#text": "9784040731279", "@_scheme": "ISBN" },
				]),
			).toEqual({
				asin: null,
				isbn10: null,
				isbn13: null,
				embeddedUid: "9784040731279",
			});
		});

		test("first valid value per field wins and fields fill independently", () => {
			expect(
				extractEmbeddedIdentifiers([
					{ "#text": "B08R8G4XMQ", "@_scheme": "MOBI-ASIN" },
					{ "#text": "B000000000", "@_scheme": "MOBI-ASIN" },
					{ "#text": "978-4-04-073127-8", "@_scheme": "ISBN" },
				]),
			).toEqual({
				asin: "B08R8G4XMQ",
				isbn10: null,
				isbn13: "9784040731278",
				embeddedUid: null,
			});
		});

		test("ISBN-10-style ASIN goes to the isbn10 field, not asin", () => {
			expect(
				extractEmbeddedIdentifiers([
					{ "#text": "4040731271", "@_scheme": "MOBI-ASIN" },
				]),
			).toEqual({
				asin: null,
				isbn10: "4040731271",
				isbn13: null,
				embeddedUid: null,
			});
		});

		test("an opaque publisher id lands in embeddedUid, uuid/calibre ids never do", () => {
			// Calibre-repackaged copy: keeps the original store id (id="uid"),
			// gains calibre/uuid identifiers. 3299511152 fails the ISBN-10 checksum,
			// so it is an opaque id, not a mislabeled ISBN.
			const result = extractEmbeddedIdentifiers(
				[
					"calibre:238",
					"uuid:72e82680-431e-4f89-877e-1f86fabc8d78",
					{ "#text": 3299511152, "@_id": "uid" },
				],
				"uid",
			);
			expect(result.embeddedUid).toBe("3299511152");
			expect(result.isbn10).toBeNull();

			// Only per-copy ids present → nothing usable.
			expect(
				extractEmbeddedIdentifiers([
					"calibre:238",
					"urn:uuid:72e82680-431e-4f89-877e-1f86fabc8d78",
					"72e82680-431e-4f89-877e-1f86fabc8d78",
				]).embeddedUid,
			).toBeNull();
		});

		test("the unique-identifier reference wins over document order", () => {
			const result = extractEmbeddedIdentifiers(
				[
					{ "#text": "other-store-id-1", "@_id": "alt" },
					{ "#text": "3299511152", "@_id": "uid" },
				],
				"uid",
			);
			expect(result.embeddedUid).toBe("3299511152");
		});

		test("a value already mapped to ISBN/ASIN is not duplicated into embeddedUid", () => {
			expect(
				extractEmbeddedIdentifiers([
					{ "#text": "B08R8G4XMQ", "@_scheme": "MOBI-ASIN" },
				]),
			).toEqual({
				asin: "B08R8G4XMQ",
				isbn10: null,
				isbn13: null,
				embeddedUid: null,
			});
		});
	});

	test("extractMetadata resolves embeddedUid via the package unique-identifier attr", () => {
		const metadata = extractMetadata({
			package: {
				"@_unique-identifier": "uid",
				metadata: {
					identifier: [
						"calibre:238",
						{
							"#text": "72e82680-431e-4f89-877e-1f86fabc8d78",
							"@_id": "bookid",
						},
						{ "#text": 3299511152, "@_id": "uid" },
					],
					title: "LoveR 1",
					language: "ja",
				},
			},
		});

		expect(metadata.embeddedUid).toBe("3299511152");
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
