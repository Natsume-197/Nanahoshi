import { afterEach, describe, expect, mock, test } from "bun:test";
import { audiobookMetadataService } from "../../audiobooks/metadata/metadata.service";
import { bookMetadataService } from "../../books/metadata/metadata.service";
import { enrichmentStateRepository } from "../enrichment.repository";
import { enrichmentService } from "../enrichment.service";

const original = {
	detail: enrichmentStateRepository.detail,
	describe: enrichmentStateRepository.describePrimaryMatch,
	bookPreview: bookMetadataService.previewFromProvider,
	audiobookPreview: audiobookMetadataService.previewFromProvider,
};

afterEach(() => {
	enrichmentStateRepository.detail = original.detail;
	enrichmentStateRepository.describePrimaryMatch = original.describe;
	bookMetadataService.previewFromProvider = original.bookPreview;
	audiobookMetadataService.previewFromProvider = original.audiobookPreview;
});

function stubDetail(
	matched: Record<string, unknown>[],
	mediaType: "ebook" | "audiobook" = "ebook",
) {
	enrichmentStateRepository.detail = (async () => ({
		bookId: 7,
		bookUuid: "book-7",
		mediaType,
		matched,
	})) as unknown as typeof enrichmentStateRepository.detail;
}

describe("enrichmentService.matchPreview", () => {
	test("a described match is returned without calling the provider", async () => {
		stubDetail([
			{
				provider: "googlebooks",
				providerId: "g1",
				title: "Stored",
				previewCover: "https://img/stored.jpg",
			},
		]);
		const preview = mock(() => Promise.resolve(null));
		bookMetadataService.previewFromProvider =
			preview as unknown as typeof bookMetadataService.previewFromProvider;

		const result = await enrichmentService.matchPreview("s", "book-7");

		expect(result).toEqual({
			title: "Stored",
			byline: null,
			previewCover: "https://img/stored.jpg",
		});
		expect(preview).not.toHaveBeenCalled();
	});

	test("an id-only match is looked up once and cached on the row", async () => {
		stubDetail([{ provider: "googlebooks", providerId: "g1" }]);
		bookMetadataService.previewFromProvider = (async () => ({
			metadata: {
				title: "Found",
				cover: "https://img/found.jpg",
				authors: [{ name: "Author" }],
				publishedDate: "2019-01-01",
			},
			lockedFields: [],
		})) as unknown as typeof bookMetadataService.previewFromProvider;
		const describe = mock(() => Promise.resolve());
		enrichmentStateRepository.describePrimaryMatch =
			describe as typeof enrichmentStateRepository.describePrimaryMatch;

		const result = await enrichmentService.matchPreview("s", "book-7");

		expect(result?.title).toBe("Found");
		expect(result?.previewCover).toBe("https://img/found.jpg");
		expect(result?.byline).toContain("Author");
		expect(describe).toHaveBeenCalledWith(
			7,
			{ provider: "googlebooks", providerId: "g1" },
			expect.objectContaining({
				title: "Found",
				previewCover: "https://img/found.jpg",
			}),
		);
	});

	test("a local cover key is never offered as a preview", async () => {
		stubDetail([{ provider: "googlebooks", providerId: "g1" }]);
		bookMetadataService.previewFromProvider = (async () => ({
			metadata: { title: "Found", cover: "data/covers/x.jpg" },
			lockedFields: [],
		})) as unknown as typeof bookMetadataService.previewFromProvider;
		enrichmentStateRepository.describePrimaryMatch =
			(async () => {}) as typeof enrichmentStateRepository.describePrimaryMatch;

		const result = await enrichmentService.matchPreview("s", "book-7");

		expect(result?.previewCover).toBeNull();
	});

	test("a provider failure falls back to the stored row without caching", async () => {
		stubDetail([{ provider: "googlebooks", providerId: "g1", title: "Old" }]);
		bookMetadataService.previewFromProvider = (async () => {
			throw new Error("cooldown");
		}) as unknown as typeof bookMetadataService.previewFromProvider;
		const describe = mock(() => Promise.resolve());
		enrichmentStateRepository.describePrimaryMatch =
			describe as typeof enrichmentStateRepository.describePrimaryMatch;

		const result = await enrichmentService.matchPreview("s", "book-7");

		expect(result).toEqual({ title: "Old", byline: null, previewCover: null });
		expect(describe).not.toHaveBeenCalled();
	});

	test("audiobooks look up through the audiobook providers", async () => {
		stubDetail([{ provider: "audible", providerId: "B0" }], "audiobook");
		const preview = mock(async () => ({
			metadata: { title: "Listen", cover: "https://img/a.jpg" },
			lockedFields: [],
		}));
		audiobookMetadataService.previewFromProvider =
			preview as unknown as typeof audiobookMetadataService.previewFromProvider;
		enrichmentStateRepository.describePrimaryMatch =
			(async () => {}) as typeof enrichmentStateRepository.describePrimaryMatch;

		const result = await enrichmentService.matchPreview("s", "book-7");

		expect(preview).toHaveBeenCalledWith("audible", 7, "B0");
		expect(result?.title).toBe("Listen");
	});

	test("no match means no preview", async () => {
		stubDetail([]);
		expect(await enrichmentService.matchPreview("s", "book-7")).toBeNull();
	});
});

describe("enrichmentService.candidatePreview", () => {
	test("returns the candidate's record in comparison shape", async () => {
		stubDetail([]);
		const preview = mock(async () => ({
			metadata: {
				title: "Candidate",
				cover: "https://img/c.jpg",
				description: "Blurb",
				authors: [{ name: "A" }],
			},
			lockedFields: [],
		}));
		bookMetadataService.previewFromProvider =
			preview as unknown as typeof bookMetadataService.previewFromProvider;

		const result = await enrichmentService.candidatePreview("s", {
			bookUuid: "book-7",
			provider: "amazon",
			providerId: "B01",
		});

		expect(preview).toHaveBeenCalledWith("amazon", {
			bookId: 7,
			uuid: "book-7",
			providerId: "B01",
		});
		expect(result?.title).toBe("Candidate");
		expect(result?.cover).toBe("https://img/c.jpg");
		expect(result?.metadata.description).toBe("Blurb");
		expect(result?.metadata.authors).toEqual(["A"]);
	});

	test("an unknown provider for the media type yields nothing", async () => {
		stubDetail([], "audiobook");
		expect(
			await enrichmentService.candidatePreview("s", {
				bookUuid: "book-7",
				provider: "googlebooks",
				providerId: "g",
			}),
		).toBeNull();
	});
});
