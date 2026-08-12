import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
		DOWNLOAD_SECRET: "00000000-0000-0000-0000-000000000001",
		CORS_ORIGIN: "http://localhost:3000",
		BETTER_AUTH_SECRET: "mock-secret-that-is-at-least-32-chars-long",
		BETTER_AUTH_URL: "http://localhost:3000",
		REDIS_HOST: "127.0.0.1",
		REDIS_PORT: 6379,
		SMTP_HOST: "smtp.example.com",
		SMTP_PORT: 465,
		SMTP_SECURE: true,
		SMTP_USER: "mock@example.com",
		SMTP_PASS: "mock",
	},
}));
mock.module("@nanahoshi-v2/db", () => ({ db: {} }));

const { shelvesRepository } = await import("../shelves.repository");
const { bookShelfRepository } = await import(
	"../../book-shelf/book-shelf.repository"
);
const { audiobookShelfRepository } = await import(
	"../../audiobook-shelf/audiobook-shelf.repository"
);
const shelvesService = await import("../shelves.service");

const original = {
	ebookCounts: shelvesRepository.ebookCounts,
	audiobookCounts: shelvesRepository.audiobookCounts,
	ebookRecentCovers: shelvesRepository.ebookRecentCovers,
	audiobookRecentCovers: shelvesRepository.audiobookRecentCovers,
	ebookList: bookShelfRepository.listByStatus,
	audiobookList: audiobookShelfRepository.listByStatus,
};

afterEach(() => {
	shelvesRepository.ebookCounts = original.ebookCounts;
	shelvesRepository.audiobookCounts = original.audiobookCounts;
	shelvesRepository.ebookRecentCovers = original.ebookRecentCovers;
	shelvesRepository.audiobookRecentCovers = original.audiobookRecentCovers;
	bookShelfRepository.listByStatus = original.ebookList;
	audiobookShelfRepository.listByStatus = original.audiobookList;
});

describe("getSummaries", () => {
	test("unions ebook + audiobook counts and merges covers newest-first per bucket", async () => {
		shelvesRepository.ebookCounts = mock(async () => [
			{ status: "want_to_read", total: 2 },
			{ status: "completed", total: 1 },
		]) as never;
		shelvesRepository.audiobookCounts = mock(async () => [
			{ status: "want_to_listen", total: 3 },
			{ status: "completed", total: 1 },
		]) as never;
		shelvesRepository.ebookRecentCovers = mock(async () => [
			{ status: "want_to_read", cover: "ebook-old", updatedAt: "2026-01-02" },
		]) as never;
		shelvesRepository.audiobookRecentCovers = mock(async () => [
			{
				status: "want_to_listen",
				cover: "audio-new",
				updatedAt: "2026-01-03",
			},
		]) as never;

		const summaries = await shelvesService.getSummaries(
			"user-1",
			"server-1",
			"ALL",
		);

		expect(summaries.map((s) => s.status)).toEqual([
			"want",
			"reading",
			"backlog",
			"completed",
		]);
		const want = summaries.find((s) => s.status === "want");
		expect(want?.count).toBe(5); // 2 ebook + 3 audiobook
		expect(want?.ebookCount).toBe(2);
		expect(want?.audiobookCount).toBe(3);
		expect(want?.ebookPreviewCovers).toEqual(["ebook-old"]);
		expect(want?.audiobookPreviewCovers).toEqual(["audio-new"]);
		// audio-new (2026-01-03) is newer than ebook-old (2026-01-02)
		expect(want?.previewCovers).toEqual(["audio-new", "ebook-old"]);
		expect(summaries.find((s) => s.status === "completed")?.count).toBe(2);
		expect(summaries.find((s) => s.status === "backlog")?.count).toBe(0);
	});

	test("fails closed without a server: zeroed buckets, no repo calls", async () => {
		const ebookCounts = mock(async () => []);
		shelvesRepository.ebookCounts = ebookCounts as never;

		const summaries = await shelvesService.getSummaries(
			"user-1",
			undefined,
			"ALL",
		);

		expect(ebookCounts).not.toHaveBeenCalled();
		expect(summaries).toHaveLength(4);
		expect(summaries.every((s) => s.count === 0)).toBe(true);
		expect(summaries.every((s) => s.previewCovers.length === 0)).toBe(true);
		expect(summaries.every((s) => s.ebookCount === 0)).toBe(true);
		expect(summaries.every((s) => s.audiobookCount === 0)).toBe(true);
	});
});

describe("listBucket", () => {
	test("merges both formats, sorts by updatedAt desc, tags mediaType, respects limit", async () => {
		bookShelfRepository.listByStatus = mock(async () => [
			{
				bookUuid: "e1",
				title: "Ebook One",
				bookFilename: "e1.epub",
				cover: "e1.jpg",
				mainColor: "#111",
				updatedAt: "2026-01-01",
				authors: [{ name: "A" }],
			},
		]) as never;
		audiobookShelfRepository.listByStatus = mock(async () => [
			{
				bookUuid: "a1",
				title: "Audio One",
				bookFilename: "a1.m4b",
				cover: "a1.jpg",
				mainColor: "#222",
				updatedAt: "2026-01-05",
				authors: [{ name: "B" }],
			},
		]) as never;

		const items = await shelvesService.listBucket(
			"user-1",
			"server-1",
			"ALL",
			"reading",
			10,
		);

		// reading bucket maps to ebook "reading" + audiobook "listening"
		expect(bookShelfRepository.listByStatus).toHaveBeenCalledWith(
			"user-1",
			"server-1",
			"ALL",
			"reading",
			10,
		);
		expect(audiobookShelfRepository.listByStatus).toHaveBeenCalledWith(
			"user-1",
			"server-1",
			"ALL",
			"listening",
			10,
		);
		// a1 (2026-01-05) is newer than e1 (2026-01-01)
		expect(items.map((i) => i.bookUuid)).toEqual(["a1", "e1"]);
		expect(items.map((i) => i.mediaType)).toEqual(["audiobook", "ebook"]);
		expect(items[0]?.filename).toBe("a1.m4b");
	});

	test("respects the limit after merging", async () => {
		bookShelfRepository.listByStatus = mock(async () => [
			{
				bookUuid: "e1",
				title: null,
				bookFilename: "e1.epub",
				cover: null,
				mainColor: null,
				updatedAt: "2026-01-01",
				authors: [],
			},
		]) as never;
		audiobookShelfRepository.listByStatus = mock(async () => [
			{
				bookUuid: "a1",
				title: null,
				bookFilename: "a1.m4b",
				cover: null,
				mainColor: null,
				updatedAt: "2026-01-05",
				authors: [],
			},
		]) as never;

		const items = await shelvesService.listBucket(
			"user-1",
			"server-1",
			"ALL",
			"want",
			1,
		);

		expect(items).toHaveLength(1);
		expect(items[0]?.bookUuid).toBe("a1");
	});

	test("fails closed without a server: empty, no repo calls", async () => {
		const ebookList = mock(async () => []);
		bookShelfRepository.listByStatus = ebookList as never;

		const items = await shelvesService.listBucket(
			"user-1",
			undefined,
			"ALL",
			"completed",
			10,
		);

		expect(ebookList).not.toHaveBeenCalled();
		expect(items).toEqual([]);
	});

	test("loads only the requested media type", async () => {
		bookShelfRepository.listByStatus = mock(async () => [
			{
				bookUuid: "e1",
				title: "Ebook One",
				bookFilename: "e1.epub",
				cover: null,
				mainColor: null,
				updatedAt: "2026-01-01",
				authors: [],
			},
		]) as never;
		const audiobookList = mock(async () => []);
		audiobookShelfRepository.listByStatus = audiobookList as never;

		const items = await shelvesService.listBucket(
			"user-1",
			"server-1",
			"ALL",
			"reading",
			10,
			"ebook",
		);

		expect(items.map((item) => item.mediaType)).toEqual(["ebook"]);
		expect(audiobookList).not.toHaveBeenCalled();
	});
});
