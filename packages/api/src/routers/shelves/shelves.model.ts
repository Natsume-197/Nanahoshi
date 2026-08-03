import { z } from "zod";
import type { AudiobookShelfStatus, ListStatus } from "../../constants";

/**
 * Unified reading-status buckets shown as "system lists" alongside collections.
 * Each bucket spans both formats (ebook shelf + audiobook shelf).
 */
export const SHELF_BUCKETS = [
	"want",
	"reading",
	"backlog",
	"completed",
] as const;

export type ShelfBucket = (typeof SHELF_BUCKETS)[number];

export const BUCKET_TO_STATUSES: Record<
	ShelfBucket,
	{ ebook: ListStatus; audiobook: AudiobookShelfStatus }
> = {
	want: { ebook: "want_to_read", audiobook: "want_to_listen" },
	reading: { ebook: "reading", audiobook: "listening" },
	backlog: { ebook: "backlog", audiobook: "backlog" },
	completed: { ebook: "completed", audiobook: "completed" },
};

export const ListShelfBucketInput = z.object({
	status: z.enum(SHELF_BUCKETS),
	limit: z.number().int().min(1).max(500).default(200),
});
