import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import { isSupportedExtension } from "../../modules/scanning/supportedExtensions";
import { type PathProbe, pathAccess } from "../libraries/path-access";

export type FolderPreview = {
	state: PathProbe["state"];
	ebooks: number;
	/** Folders holding audio files: one audiobook each, as the scanner groups them. */
	audiobooks: number;
	/** The walk stopped at its limits; the real counts are higher. */
	partial: boolean;
};

const LIMITS = { entries: 50_000, ms: 4000 };

/**
 * What creating a library on this folder would import, before creating it:
 * onboarding says "312 books and 40 audiobooks" instead of asking the admin
 * to know. Bounded in entries and time, since a NAS can hold millions.
 */
export async function previewFolder(
	location: string,
	limits = LIMITS,
): Promise<FolderPreview> {
	const probe = await pathAccess.probe(location);
	if (probe.state !== "ok")
		return { state: probe.state, ebooks: 0, audiobooks: 0, partial: false };

	const deadline = Date.now() + limits.ms;
	const audioFolders = new Set<string>();
	let ebooks = 0;
	let seen = 0;
	let partial = false;
	const queue = [path.normalize(location)];
	while (queue.length > 0) {
		if (seen >= limits.entries || Date.now() > deadline) {
			partial = true;
			break;
		}
		const dir = queue.shift() as string;
		let entries: Dirent[];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			seen++;
			if (entry.name.startsWith(".")) continue;
			if (entry.isDirectory()) queue.push(path.join(dir, entry.name));
			else if (!entry.isFile()) continue;
			else if (isSupportedExtension(entry.name, "ebook")) ebooks++;
			else if (isSupportedExtension(entry.name, "audiobook"))
				audioFolders.add(dir);
		}
	}
	return { state: "ok", ebooks, audiobooks: audioFolders.size, partial };
}
