import fs from "node:fs/promises";
import path from "node:path";
import { isSupportedExtension } from "../../modules/scanning/supportedExtensions";
import type { LibraryScope } from "../_shared/library-scope";
import { audiobookRepository } from "../audiobooks/audiobook.repository";
import { audiobookMetadataRepository } from "../audiobooks/metadata/metadata.repository";
import { bookRepository } from "../books/book.repository";
import { seriesRepository } from "../series/series.repository";
import { fileRepository } from "./file.repository";
import { downloadFilename, zipFilename } from "./helpers/seriesZip";
import {
	generateAudioFileDownloadUrl,
	generateSeriesDownloadUrl,
	generateSignedUrl,
} from "./helpers/urlSigner";

type BookFileRow = NonNullable<
	Awaited<ReturnType<typeof fileRepository.findBookByUuid>>
>;

export const getFileInfo = async (uuid: string, serverId?: string) => {
	const b = await fileRepository.findBookByUuid(uuid, serverId);
	if (!b) return null;

	// Audiobooks have no single ebook file (relativePath may be a directory) —
	// callers that need audiobook downloads go through getDownloadPayload.
	if (b.libraryMediaType === "audiobook") return null;

	return resolveEbookFileInfo(b);
};

const resolveEbookFileInfo = async (b: BookFileRow) => {
	if (!isSupportedExtension(b.filename, "ebook")) return null;
	const fullPath = path.join(b.libraryPath ?? "", b.relativePath ?? "");
	return {
		filename: downloadFilename(b.title, b.filename),
		mimetype: b.mediaType || "application/octet-stream",
		fullPath,
		size: Number(b.filesizeKb) * 1024,
	};
};

export const getDirectories = async (location?: string) => {
	const items: { name: string; path: string; hasChildren: boolean }[] = [];

	if (!location || location === "") {
		if (process.platform === "win32") {
			// TODO: search a better way to find drives in Windows (Forgive me, Linus)
			for (let i = 67; i <= 90; i++) {
				const letter = String.fromCharCode(i);
				const drive = `${letter}:\\`;
				try {
					await fs.access(drive);
					items.push({ name: letter, path: drive, hasChildren: true });
				} catch {
					// doesnt exist, ignore
				}
			}
		} else {
			items.push({ name: "/", path: "/", hasChildren: true });
		}
	} else {
		try {
			const dirents = await fs.readdir(location, { withFileTypes: true });
			for (const entry of dirents) {
				if (entry.isDirectory()) {
					const fullPath = `${location}/${entry.name}`;
					items.push({ name: entry.name, path: fullPath, hasChildren: true });
				}
			}
		} catch {
			// ignore permission errors
		}
	}

	return items;
};

export type SeriesZipEntry = { filename: string; fullPath: string };

export type DownloadPayload =
	| {
			kind: "file";
			mediaType: "ebook" | "audiobook";
			filename: string;
			mimetype: string;
			fullPath: string;
			size: number;
	  }
	| {
			kind: "zip";
			mediaType: "audiobook";
			zipName: string;
			entries: SeriesZipEntry[];
	  };

const COVERS_DIR = path.join(process.cwd(), "data/covers");

// The stored cover for the zip, named like the source folder convention
// (cover.avif) so it survives re-import. Skipped when missing on disk.
const audiobookCoverEntry = async (
	bookId: number,
): Promise<SeriesZipEntry | null> => {
	const metadata = await audiobookMetadataRepository.findByBookId(bookId);
	if (!metadata?.cover) return null;

	// Stored as "data/covers/<uuid>.avif" or a bare filename depending on the
	// writer; both live in COVERS_DIR.
	const fullPath = path.join(COVERS_DIR, path.basename(metadata.cover));
	try {
		await fs.access(fullPath);
	} catch {
		return null;
	}
	return { filename: `cover${path.extname(metadata.cover)}`, fullPath };
};

// Resolves what a book download actually serves. Aligned with audiobookshelf:
// a single-file audiobook downloads the file directly, a multi-file one
// downloads a zip of its audio files plus the cover.
export const getDownloadPayload = async (
	uuid: string,
	serverId?: string,
): Promise<DownloadPayload | null> => {
	const b = await fileRepository.findBookByUuid(uuid, serverId);
	if (!b) return null;

	if (b.libraryMediaType !== "audiobook") {
		const file = await resolveEbookFileInfo(b);
		return file ? { kind: "file", mediaType: "ebook", ...file } : null;
	}

	const audioFiles = await audiobookRepository.listAudioFiles(b.id);
	const first = audioFiles[0];
	if (!first) return null;

	if (audioFiles.length === 1) {
		return {
			kind: "file",
			mediaType: "audiobook",
			filename: downloadFilename(b.title, first.filename),
			mimetype: first.mimeType || "application/octet-stream",
			fullPath: first.path,
			size: first.filesize ?? 0,
		};
	}

	const entries: SeriesZipEntry[] = audioFiles.map((f) => ({
		filename: f.filename,
		fullPath: f.path,
	}));
	const cover = await audiobookCoverEntry(b.id);
	if (cover) entries.push(cover);

	return {
		kind: "zip",
		mediaType: "audiobook",
		zipName: zipFilename(b.title ?? b.filename),
		entries: dedupeZipEntries(entries),
	};
};

export const getFileDownload = async (uuid: string, serverId?: string) => {
	if (!serverId) return null;

	const payload = await getDownloadPayload(uuid, serverId);
	if (!payload) return null;

	const url = generateSignedUrl(uuid, 60);
	return {
		url,
		mediaType: payload.mediaType,
		filename: payload.kind === "zip" ? payload.zipName : payload.filename,
	};
};

// Signed URL for one audio file of an audiobook (ABS-style per-file download).
export const getAudioFileDownload = async (
	uuid: string,
	fileIndex: number,
	serverId?: string,
) => {
	if (!serverId) return null;

	const file = await audiobookRepository.getAudioFile(
		uuid,
		fileIndex,
		serverId,
	);
	if (!file) return null;

	return {
		url: generateAudioFileDownloadUrl(uuid, fileIndex, 60),
		filename: file.filename,
	};
};

const dedupeZipEntries = (entries: SeriesZipEntry[]): SeriesZipEntry[] => {
	const usedNames = new Set<string>();
	return entries.map((entry) => {
		let name = entry.filename;
		if (usedNames.has(name)) {
			const ext = path.extname(name);
			const base = name.slice(0, name.length - ext.length);
			let i = 2;
			while (usedNames.has(`${base} (${i})${ext}`)) i++;
			name = `${base} (${i})${ext}`;
		}
		usedNames.add(name);
		return { filename: name, fullPath: entry.fullPath };
	});
};

// Every downloadable file of a series, with zip-safe deduped filenames. Books
// whose file is missing on disk are skipped.
export const getSeriesZipEntries = async (
	seriesUuid: string,
	serverId: string,
	scope: LibraryScope = "ALL",
): Promise<SeriesZipEntry[]> => {
	const books = await bookRepository.listBySeriesUuid(
		seriesUuid,
		serverId,
		scope,
	);

	const entries: SeriesZipEntry[] = [];
	for (const book of books) {
		const file = await getFileInfo(book.uuid, serverId);
		if (!file) continue;
		entries.push({ filename: file.filename, fullPath: file.fullPath });
	}
	return dedupeZipEntries(entries);
};

export const getSeriesZipDownloadPayload = async (
	seriesUuid: string,
	serverId: string,
	scope: LibraryScope = "ALL",
) => {
	const [series, entries] = await Promise.all([
		seriesRepository.getByUuid(seriesUuid, serverId, scope),
		getSeriesZipEntries(seriesUuid, serverId, scope),
	]);
	return {
		entries,
		seriesName: series?.name ?? "series",
	};
};

export const getSeriesDownload = async (
	seriesUuid: string,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	if (!serverId) return null;

	const { seriesName, entries } = await getSeriesZipDownloadPayload(
		seriesUuid,
		serverId,
		scope,
	);
	if (entries.length === 0) return null;

	return {
		url: generateSeriesDownloadUrl(seriesUuid),
		fileCount: entries.length,
		seriesName,
	};
};
