import { activeChapterIndex, type Chapter } from "./timing";

/** What the mini player shows between the tap and the book being ready:
 * enough to name the book and the chapter it will open on, and whether
 * loading it failed. */
export type PendingBook = {
	uuid: string;
	title: string;
	cover: string | null;
	color: string | null;
	authors: string[];
	chapters: Chapter[];
	/** Where it will most likely start, when the phone already knows. */
	time: number | null;
	failed: boolean;
};

export type BookPreview = Pick<
	PendingBook,
	"title" | "cover" | "color" | "authors"
> & { chapters?: Chapter[] };

/** The first source that knows the book (the download on disk, cached
 * details, what the tapped card showed); a bare entry otherwise, so the
 * card still appears while it loads. */
export function pendingBook(
	uuid: string,
	sources: (BookPreview | null | undefined)[],
	time: number | null = null,
): PendingBook {
	const known = sources.find((source) => source?.title);
	return {
		uuid,
		title: known?.title ?? "",
		cover: known?.cover ?? sources.find((s) => s?.cover)?.cover ?? null,
		color: known?.color ?? null,
		authors: known?.authors ?? [],
		chapters: sources.find((s) => s?.chapters?.length)?.chapters ?? [],
		time,
		failed: false,
	};
}

/** The chapter a pending book will open on, the same one the playing card
 * shows once it loads; null when the chapters or the position are unknown. */
export function pendingChapter(pending: PendingBook): Chapter | null {
	if (pending.time === null || pending.chapters.length === 0) return null;
	return (
		pending.chapters[activeChapterIndex(pending.chapters, pending.time)] ?? null
	);
}

/** Where a book will start, guessed from what is already on the phone in
 * the order playback itself trusts: a finished book starts over. */
export function guessStart(
	local: number | null | undefined,
	server: { time: number | null | undefined; completed: boolean } | null,
): number | null {
	if (typeof local === "number") return local;
	if (!server) return null;
	if (server.completed) return 0;
	return typeof server.time === "number" ? server.time : null;
}
