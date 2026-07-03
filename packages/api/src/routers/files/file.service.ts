import fs from "node:fs/promises";
import path from "node:path";
import {
	getConvertedEpubPath,
	needsConversion,
} from "../../modules/conversion/converter";
import { bookRepository } from "../books/book.repository";
import { seriesRepository } from "../series/series.repository";
import { fileRepository } from "./file.repository";
import {
	generateSeriesDownloadUrl,
	generateSignedUrl,
} from "./helpers/urlSigner";

export const getFileInfo = async (uuid: string, serverId?: string) => {
	// TODO: we need to change this at the moment of supporting audiobooks
	const b = await fileRepository.findBookByUuid(uuid, serverId);
	if (!b) return null;

	// For converted formats, serve the converted EPUB instead
	if (needsConversion(b.filename)) {
		const convertedPath = getConvertedEpubPath(b.uuid);
		const epubFilename = b.filename.replace(/\.[^.]+$/, ".epub");
		try {
			const stat = await fs.stat(convertedPath);
			return {
				filename: epubFilename,
				mimetype: "application/epub+zip",
				fullPath: convertedPath,
				size: stat.size,
			};
		} catch {
			// Converted EPUB missing — don't fall through to serve AZW3 (reader can't open it)
			return null;
		}
	}

	const fullPath = path.join(b.libraryPath ?? "", b.relativePath ?? "");
	return {
		filename: b.filename,
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

export const getFileDownload = async (uuid: string, serverId?: string) => {
	if (!serverId) return null;

	const file = await getFileInfo(uuid, serverId);
	if (!file) return null;

	const url = generateSignedUrl(uuid, 60);
	return { url, file };
};

export type SeriesZipEntry = { filename: string; fullPath: string };

// Every downloadable file of a series, with zip-safe deduped filenames. Books
// whose file is missing on disk are skipped.
export const getSeriesZipEntries = async (
	seriesUuid: string,
	serverId: string,
): Promise<SeriesZipEntry[]> => {
	const books = await bookRepository.listBySeriesUuid(seriesUuid, serverId);

	const entries: SeriesZipEntry[] = [];
	const usedNames = new Set<string>();
	for (const book of books) {
		const file = await getFileInfo(book.uuid, serverId);
		if (!file) continue;

		let name = file.filename;
		if (usedNames.has(name)) {
			const ext = path.extname(name);
			const base = name.slice(0, name.length - ext.length);
			let i = 2;
			while (usedNames.has(`${base} (${i})${ext}`)) i++;
			name = `${base} (${i})${ext}`;
		}
		usedNames.add(name);
		entries.push({ filename: name, fullPath: file.fullPath });
	}
	return entries;
};

export const getSeriesZipDownloadPayload = async (
	seriesUuid: string,
	serverId: string,
) => {
	const [series, entries] = await Promise.all([
		seriesRepository.getByUuid(seriesUuid, serverId),
		getSeriesZipEntries(seriesUuid, serverId),
	]);
	return {
		entries,
		seriesName: series?.name ?? "series",
	};
};

export const getSeriesDownload = async (
	seriesUuid: string,
	serverId?: string,
) => {
	if (!serverId) return null;

	const { seriesName, entries } = await getSeriesZipDownloadPayload(
		seriesUuid,
		serverId,
	);
	if (entries.length === 0) return null;

	return {
		url: generateSeriesDownloadUrl(seriesUuid),
		fileCount: entries.length,
		seriesName,
	};
};
