export type DownloadKind = "book" | "audiobook";

/** What the Downloads page shows for a title on the device, written beside
 * its files so it lists (cover included) without the server. */
export type DownloadEntry = {
	kind: DownloadKind;
	uuid: string;
	serverId: string;
	title: string;
	authors: string[];
	/** The server's cover path, for when the local copy is missing. */
	cover: string | null;
	color: string | null;
	/** false while files are still arriving (or the download was cut off). */
	complete: boolean;
	savedAt: number;
	/** Why the title is on the phone. Missing on downloads from before smart
	 * downloads: those count as the user's own (see smart.ts). */
	reasons?: DownloadReason[];
	/** When the user last finished (or reopened a finished) copy. */
	finishedAt?: number | null;
	/** For "next in series"; null when the title has none. */
	seriesUuid?: string | null;
};

/** Why a title is on the phone. Only "manual" is the user's own choice. */
export type DownloadReason =
	| { type: "manual" }
	| { type: "series" }
	| { type: "reading" }
	| { type: "want" }
	| { type: "collection"; id: string; name: string };

export type DownloadJobStatus = "queued" | "downloading" | "failed";

export type DownloadJob = {
	kind: DownloadKind;
	serverId: string;
	status: DownloadJobStatus;
	/** 0–1 */
	progress: number;
};

/**
 * Overall progress of a multi-file download: finished files count whole,
 * the one in flight by its fraction. Weights are the files' durations (or
 * sizes); without any, every file weighs the same.
 */
export function weightedProgress(
	weights: number[],
	done: number,
	currentFraction: number,
): number {
	if (weights.length === 0) return 0;
	const safe = weights.every((weight) => weight > 0)
		? weights
		: weights.map(() => 1);
	const total = safe.reduce((sum, weight) => sum + weight, 0);
	const finished = safe.slice(0, done).reduce((sum, weight) => sum + weight, 0);
	const current = safe[done] ?? 0;
	const fraction = Math.min(1, Math.max(0, currentFraction));
	return Math.min(1, (finished + current * fraction) / total);
}

/** Bytes written / expected; -1 (no Content-Length) reads as unknown → 0. */
export function byteFraction(written: number, total: number): number {
	return total > 0 ? Math.min(1, written / total) : 0;
}

/** `07.mp3` for track 7 of "Chapter 07 - Title.mp3": index keeps the order,
 * the extension keeps the player's format sniffing honest. */
export function audioFileName(index: number, serverFilename: string): string {
	const match = /\.([a-z0-9]{1,5})$/i.exec(serverFilename);
	return `${index}${match ? `.${match[1].toLowerCase()}` : ""}`;
}

/** A server filename as it can sit on the phone: Android builds a URI from
 * the path and rejects brackets and the like ("[Author] Title.azw3"). */
export function safeFileName(filename: string): string {
	return filename.replace(/[[\]{}|\\^`<>#%"?]/g, "_");
}

export type SavedPosition = { time: number; updatedAt: number };

/**
 * Where an audiobook resumes. The server wins unless this phone listened more
 * recently (offline, the save never reached it).
 */
export function pickStartPosition(
	server: { time: number; updatedAt: number | null } | null,
	local: SavedPosition | null,
): { time: number; fromLocal: boolean } {
	if (!local) return { time: server?.time ?? 0, fromLocal: false };
	if (
		!server ||
		server.updatedAt === null ||
		local.updatedAt > server.updatedAt
	)
		return { time: local.time, fromLocal: true };
	return { time: server.time, fromLocal: false };
}

/** In-flight and unfinished first, then newest. */
export function sortEntries<T extends DownloadEntry>(entries: T[]): T[] {
	return [...entries].sort(
		(a, b) => Number(a.complete) - Number(b.complete) || b.savedAt - a.savedAt,
	);
}

export function formatBytes(bytes: number, locale: string): string {
	const units = ["B", "KB", "MB", "GB"];
	let value = Math.max(0, bytes);
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	const digits = unit >= 2 && value < 10 ? 1 : 0;
	return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}

/** Books download with reading access (the reader needs the file anyway);
 * audiobooks need the server's own download permission. */
export function canDownloadTitle(
	kind: DownloadKind,
	can: (resource: string, action: string) => boolean,
): boolean {
	return kind === "book" || can("audiobook", "download");
}

const MIME_TYPES: Record<string, string> = {
	epub: "application/epub+zip",
	pdf: "application/pdf",
	cbz: "application/vnd.comicbook+zip",
	cbr: "application/vnd.comicbook-rar",
	mobi: "application/x-mobipocket-ebook",
	azw3: "application/vnd.amazon.ebook",
	zip: "application/zip",
	mp3: "audio/mpeg",
	m4a: "audio/mp4",
	m4b: "audio/mp4",
	ogg: "audio/ogg",
	opus: "audio/ogg",
	flac: "audio/flac",
};

/** The type the share sheet offers apps by; unknown formats stay generic. */
export function exportMimeType(filename: string): string {
	const extension = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase();
	return (extension && MIME_TYPES[extension]) || "application/octet-stream";
}

/** A name safe for the phone's file system, keeping the extension. */
export function exportFileName(filename: string, fallback: string): string {
	const base = filename.split(/[\\/]/).pop() ?? "";
	const clean = [...base]
		.map((char) => (char < " " || ':*?"<>|'.includes(char) ? "_" : char))
		.join("")
		.trim();
	return clean && clean !== "." && clean !== ".." ? clean : fallback;
}

/** Export progress. Multi-file audiobooks stream as a ZIP with no length,
 * so the audiobook's own size stands in (a stored ZIP is barely bigger);
 * it never reads 100% before the file is actually done. */
export function exportProgress(
	written: number,
	total: number,
	sizeHint: number,
): number {
	if (total > 0) return byteFraction(written, total);
	if (sizeHint > 0) return Math.min(0.99, written / sizeHint);
	return 0;
}

/**
 * Where the saved file went, for the "saved" note: "Download/Nanahoshi/
 * Dune.epub" for a document on the phone's storage (…/document/primary%3A
 * Download%2FNanahoshi%2FDune.epub). SD cards drop their volume id; other
 * providers use opaque ids, so they get null.
 */
export function savedLocationLabel(uri: string): string | null {
	if (!uri.startsWith("content://com.android.externalstorage.documents/"))
		return null;
	const id = /\/document\/([^/?#]+)/.exec(uri)?.[1];
	if (!id) return null;
	let path: string;
	try {
		path = decodeURIComponent(id);
	} catch {
		return null;
	}
	// "primary:Download/Dune.epub" → drop the volume.
	const label = path.slice(path.indexOf(":") + 1);
	return label || null;
}

/**
 * Copies `total` bytes from one open file to another in chunks, yielding
 * between them so the UI keeps drawing (the handles are synchronous). Stops
 * early if the source runs short.
 */
export async function copyInChunks({
	read,
	write,
	total,
	chunkSize = 4 * 1024 * 1024,
	onProgress,
	yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
}: {
	read: (length: number) => Uint8Array;
	write: (bytes: Uint8Array) => void;
	total: number;
	chunkSize?: number;
	onProgress?: (fraction: number) => void;
	yieldToUi?: () => Promise<void>;
}): Promise<number> {
	let copied = 0;
	while (copied < total) {
		const chunk = read(Math.min(chunkSize, total - copied));
		if (chunk.length === 0) break;
		write(chunk);
		copied += chunk.length;
		onProgress?.(copied / total);
		await yieldToUi();
	}
	return copied;
}
