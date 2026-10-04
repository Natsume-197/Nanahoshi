import type { ReaderBootBook } from "@nanahoshi/reader-bridge";
import { Directory, File, Paths } from "expo-file-system";
import { assertNetwork } from "@/lib/simulated-offline";
import type { PlayerBook } from "@/player/engine";
import type { DownloadEntry, DownloadKind, SavedPosition } from "./model";

// Everything lives in the document directory: the reader page sits there too,
// so the WebView may read the books beside it, and the OS never evicts it.
const ROOTS: Record<DownloadKind, string> = {
	book: "books",
	audiobook: "audiobooks",
};

export const titleDirectory = (
	kind: DownloadKind,
	serverId: string,
	uuid: string,
) => new Directory(Paths.document, ROOTS[kind], serverId, uuid);

const ensureDirectory = (directory: Directory) =>
	directory.create({ intermediates: true, idempotent: true });

function readJson<T>(file: File): T | null {
	if (!file.exists) return null;
	try {
		return JSON.parse(file.textSync()) as T;
	} catch {
		return null;
	}
}

function writeJson(file: File, value: unknown) {
	ensureDirectory(file.parentDirectory);
	file.write(JSON.stringify(value));
}

export type Transfer = {
	headers?: Record<string, string>;
	signal?: AbortSignal;
	onProgress?: (written: number, total: number) => void;
};

/** Download beside the target and move it into place, so an interrupted
 * download never passes for a complete file. */
export async function downloadInto(
	url: string,
	target: File,
	transfer: Transfer,
) {
	assertNetwork();
	ensureDirectory(target.parentDirectory);
	const partial = new File(target.parentDirectory, `${target.name}.part`);
	await File.downloadFileAsync(url, partial, {
		headers: transfer.headers,
		idempotent: true,
		signal: transfer.signal,
		onProgress: transfer.onProgress
			? ({ bytesWritten, totalBytes }) =>
					transfer.onProgress?.(bytesWritten, totalBytes)
			: undefined,
	});
	if (!partial.size) {
		partial.delete();
		throw new Error("The download was empty");
	}
	if (target.exists) target.delete();
	partial.moveSync(target);
	return target;
}

// ── books ──────────────────────────────────────────────────────────────────

export function localBookFile(
	serverId: string,
	uuid: string,
	filename: string,
) {
	return new File(titleDirectory("book", serverId, uuid), filename);
}

export const hasFile = (file: File) => file.exists && (file.size ?? 0) > 0;

/** The book on disk, downloading it first when this device never opened it. */
export async function ensureBookFile({
	serverId,
	uuid,
	filename,
	resolveUrl,
	cookie,
	signal,
	onProgress,
}: {
	serverId: string;
	uuid: string;
	filename: string;
	resolveUrl: () => Promise<string>;
	cookie: string | null;
} & Pick<Transfer, "signal" | "onProgress">) {
	const file = localBookFile(serverId, uuid, filename);
	if (hasFile(file)) return file;
	return downloadInto(await resolveUrl(), file, {
		headers: cookie ? { Cookie: cookie } : undefined,
		signal,
		onProgress,
	});
}

const bookMetaFile = (serverId: string, uuid: string) =>
	new File(titleDirectory("book", serverId, uuid), "book.json");

/** Keeps what the reader needs to reopen the book without the server. */
export function saveBookMeta(
	serverId: string,
	uuid: string,
	book: ReaderBootBook,
) {
	writeJson(bookMetaFile(serverId, uuid), book);
}

export function readBookMeta(serverId: string, uuid: string) {
	return readJson<ReaderBootBook>(bookMetaFile(serverId, uuid));
}

// ── audiobooks ─────────────────────────────────────────────────────────────

/** The player's book plus which file on disk holds each track. */
export type SavedAudiobook = PlayerBook & {
	tracks: { index: number; name: string }[];
};

const audiobookMetaFile = (serverId: string, uuid: string) =>
	new File(titleDirectory("audiobook", serverId, uuid), "audiobook.json");

export function saveAudiobookMeta(serverId: string, book: SavedAudiobook) {
	writeJson(audiobookMetaFile(serverId, book.uuid), book);
}

export function trackFile(serverId: string, uuid: string, name: string) {
	return new File(titleDirectory("audiobook", serverId, uuid), name);
}

/** Server ids that hold this audiobook; uuids are global, servers aren't known
 * to the player. */
function audiobookServers(uuid: string): string[] {
	const root = new Directory(Paths.document, ROOTS.audiobook);
	if (!root.exists) return [];
	return root
		.list()
		.filter(
			(item): item is Directory =>
				item instanceof Directory && new Directory(item, uuid).exists,
		)
		.map((item) => item.name);
}

/** A fully downloaded audiobook, ready to play without the network. */
export function findDownloadedAudiobook(uuid: string) {
	for (const serverId of audiobookServers(uuid)) {
		const entry = readEntry("audiobook", serverId, uuid);
		const book = readJson<SavedAudiobook>(audiobookMetaFile(serverId, uuid));
		if (!entry?.complete || !book) continue;
		const files = book.tracks.map((track) =>
			trackFile(serverId, uuid, track.name),
		);
		if (files.every(hasFile)) return { serverId, book, files };
	}
	return null;
}

/** The cover saved with a downloaded audiobook (lock screen artwork offline). */
export function localCoverUri(uuid: string): string | null {
	for (const serverId of audiobookServers(uuid)) {
		const cover = coverFile("audiobook", serverId, uuid);
		if (cover.exists) return cover.uri;
	}
	return null;
}

const positionFile = (serverId: string, uuid: string) =>
	new File(titleDirectory("audiobook", serverId, uuid), "position.json");

/** The last position this phone played, kept for offline listening. */
export function saveLocalPosition(uuid: string, time: number) {
	for (const serverId of audiobookServers(uuid))
		writeJson(positionFile(serverId, uuid), {
			time,
			updatedAt: Date.now(),
		} satisfies SavedPosition);
}

export function readLocalPosition(uuid: string): SavedPosition | null {
	for (const serverId of audiobookServers(uuid)) {
		const saved = readJson<SavedPosition>(positionFile(serverId, uuid));
		if (saved) return saved;
	}
	return null;
}

// ── entries ────────────────────────────────────────────────────────────────

const entryFile = (kind: DownloadKind, serverId: string, uuid: string) =>
	new File(titleDirectory(kind, serverId, uuid), "entry.json");

export const coverFile = (kind: DownloadKind, serverId: string, uuid: string) =>
	new File(titleDirectory(kind, serverId, uuid), "cover.jpg");

export function writeEntry(entry: DownloadEntry) {
	writeJson(entryFile(entry.kind, entry.serverId, entry.uuid), entry);
}

export function readEntry(kind: DownloadKind, serverId: string, uuid: string) {
	return readJson<DownloadEntry>(entryFile(kind, serverId, uuid));
}

export type ListedDownload = DownloadEntry & {
	bytes: number;
	/** file:// cover saved with the download, when there is one. */
	localCover: string | null;
};

/** Every title on this device, for one server. Books the reader cached before
 * downloads had entries are listed from their reader metadata. */
export function listDownloads(serverId: string): ListedDownload[] {
	const listed: ListedDownload[] = [];
	for (const kind of Object.keys(ROOTS) as DownloadKind[]) {
		const root = new Directory(Paths.document, ROOTS[kind], serverId);
		if (!root.exists) continue;
		for (const item of root.list()) {
			if (!(item instanceof Directory)) continue;
			const uuid = item.name;
			const entry =
				readEntry(kind, serverId, uuid) ??
				(kind === "book" ? legacyBookEntry(serverId, uuid) : null);
			// No entry yet: the reader is still fetching it for the first time.
			if (!entry) continue;
			const cover = coverFile(kind, serverId, uuid);
			listed.push({
				...entry,
				bytes: item.size ?? 0,
				localCover: cover.exists ? cover.uri : null,
			});
		}
	}
	return listed;
}

function legacyBookEntry(serverId: string, uuid: string): DownloadEntry | null {
	const meta = readBookMeta(serverId, uuid);
	if (!meta || !hasFile(localBookFile(serverId, uuid, meta.filename ?? "")))
		return null;
	return {
		kind: "book",
		uuid,
		serverId,
		title: meta.title ?? "",
		authors: [],
		cover: meta.cover ?? null,
		color: null,
		complete: true,
		savedAt: 0,
	};
}

export function removeDownload(
	kind: DownloadKind,
	serverId: string,
	uuid: string,
) {
	const directory = titleDirectory(kind, serverId, uuid);
	if (directory.exists) directory.delete();
}

/** Signing out (or leaving the server) removes this account's titles. */
export function clearDownloads() {
	for (const root of Object.values(ROOTS)) {
		const directory = new Directory(Paths.document, root);
		if (directory.exists) directory.delete();
	}
}

export const freeSpace = () => Paths.availableDiskSpace;
