import fs from "node:fs/promises";
import path from "node:path";
import { findBookByUuid } from "./file.repository";
import { generateSignedUrl } from "./helpers/urlSigner";

export const getFileInfo = async (uuid: string) => {
	// TODO: we need to change this at the moment of supporting audiobooks
	const b = await findBookByUuid(uuid);
	if (!b) return null;

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

export const getFileDownload = async (uuid: string) => {
	const file = await getFileInfo(uuid);
	if (!file) return null;

	const url = generateSignedUrl(uuid, 60);
	return { url, file };
};
