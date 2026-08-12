import type { LibraryScope } from "../_shared/library-scope";
import { audiobookShelfRepository } from "../audiobook-shelf/audiobook-shelf.repository";
import { bookShelfRepository } from "../book-shelf/book-shelf.repository";
import {
	BUCKET_TO_STATUSES,
	SHELF_BUCKETS,
	type ShelfBucket,
} from "./shelves.model";
import { shelvesRepository } from "./shelves.repository";

const PREVIEW_COVER_LIMIT = 5;

export type ShelfSummary = {
	status: ShelfBucket;
	count: number;
	previewCovers: string[];
	ebookCount: number;
	ebookPreviewCovers: string[];
	audiobookCount: number;
	audiobookPreviewCovers: string[];
};

/** Per-bucket count + a few recent covers, unioning the ebook + audiobook shelves. */
export async function getSummaries(
	userId: string,
	serverId: string | undefined,
	scope: LibraryScope,
): Promise<ShelfSummary[]> {
	// Fail closed: no active server resolves to empty (but still show the cards).
	if (!serverId) {
		return SHELF_BUCKETS.map((status) => ({
			status,
			count: 0,
			previewCovers: [],
			ebookCount: 0,
			ebookPreviewCovers: [],
			audiobookCount: 0,
			audiobookPreviewCovers: [],
		}));
	}
	const [ebookCounts, audiobookCounts, ebookCovers, audiobookCovers] =
		await Promise.all([
			shelvesRepository.ebookCounts(userId, serverId, scope),
			shelvesRepository.audiobookCounts(userId, serverId, scope),
			shelvesRepository.ebookRecentCovers(userId, serverId, scope),
			shelvesRepository.audiobookRecentCovers(userId, serverId, scope),
		]);

	const ebookCountByStatus = new Map(
		ebookCounts.map((r) => [r.status, r.total]),
	);
	const audiobookCountByStatus = new Map(
		audiobookCounts.map((r) => [r.status, r.total]),
	);

	return SHELF_BUCKETS.map((bucket) => {
		const { ebook, audiobook } = BUCKET_TO_STATUSES[bucket];
		const ebookCount = ebookCountByStatus.get(ebook) ?? 0;
		const audiobookCount = audiobookCountByStatus.get(audiobook) ?? 0;
		const ebookPreviewCovers = ebookCovers
			.filter((row) => row.status === ebook)
			.map((row) => row.cover)
			.filter((cover): cover is string => cover !== null)
			.slice(0, PREVIEW_COVER_LIMIT);
		const audiobookPreviewCovers = audiobookCovers
			.filter((row) => row.status === audiobook)
			.map((row) => row.cover)
			.filter((cover): cover is string => cover !== null)
			.slice(0, PREVIEW_COVER_LIMIT);
		const count = ebookCount + audiobookCount;

		const previewCovers = [
			...ebookCovers.filter((r) => r.status === ebook),
			...audiobookCovers.filter((r) => r.status === audiobook),
		]
			// Newest placement first, so the mosaic mirrors the listing order.
			.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
			.map((r) => r.cover)
			.filter((cover): cover is string => cover !== null)
			.slice(0, PREVIEW_COVER_LIMIT);

		return {
			status: bucket,
			count,
			previewCovers,
			ebookCount,
			ebookPreviewCovers,
			audiobookCount,
			audiobookPreviewCovers,
		};
	});
}

export type ShelfBucketBook = {
	bookUuid: string;
	title: string | null;
	filename: string;
	cover: string | null;
	mainColor: string | null;
	mediaType: "ebook" | "audiobook";
	updatedAt: string;
	authors: { uuid?: string | null; name: string; role?: string | null }[];
};

/** Merged, recency-sorted books for a bucket across both shelf tables. */
export async function listBucket(
	userId: string,
	serverId: string | undefined,
	scope: LibraryScope,
	bucket: ShelfBucket,
	limit: number,
	mediaType: "ebook" | "audiobook" | "all" = "all",
): Promise<ShelfBucketBook[]> {
	if (!serverId) return [];
	const { ebook, audiobook } = BUCKET_TO_STATUSES[bucket];
	const [ebookRows, audiobookRows] = await Promise.all([
		mediaType === "audiobook"
			? Promise.resolve([])
			: bookShelfRepository.listByStatus(userId, serverId, scope, ebook, limit),
		mediaType === "ebook"
			? Promise.resolve([])
			: audiobookShelfRepository.listByStatus(
					userId,
					serverId,
					scope,
					audiobook,
					limit,
				),
	]);

	const items: ShelfBucketBook[] = [
		...ebookRows.map((r) => ({
			bookUuid: r.bookUuid,
			title: r.title,
			filename: r.bookFilename,
			cover: r.cover,
			mainColor: r.mainColor ?? null,
			mediaType: "ebook" as const,
			updatedAt: r.updatedAt,
			authors: r.authors,
		})),
		...audiobookRows.map((r) => ({
			bookUuid: r.bookUuid,
			title: r.title,
			filename: r.bookFilename,
			cover: r.cover,
			mainColor: r.mainColor ?? null,
			mediaType: "audiobook" as const,
			updatedAt: r.updatedAt,
			authors: r.authors,
		})),
	];

	return items
		.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
		.slice(0, limit);
}
