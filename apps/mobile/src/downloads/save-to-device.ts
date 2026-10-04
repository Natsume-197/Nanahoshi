import { Directory, File, FileMode } from "expo-file-system";
import { copyInChunks } from "./model";

/**
 * Android: the system folder picker, then the file created inside the chosen
 * folder (Android renames it on a clash). The URI to write to, or null when
 * the picker was dismissed. iOS never needs this — its share sheet has
 * "Save to Files".
 */
export async function pickSaveTarget(
	name: string,
	mimeType: string,
): Promise<string | null> {
	let folder: Directory;
	try {
		folder = await Directory.pickDirectoryAsync();
	} catch {
		return null;
	}
	return folder.createFile(name, mimeType).uri;
}

/**
 * Writes the file into the document created for it, chunk by chunk. Not
 * `File.copy`: it refuses an existing destination, and with overwrite it
 * deletes the document before writing to it.
 */
export async function writeToDocument(
	source: File,
	target: string,
	onProgress: (fraction: number) => void,
) {
	const output = new File(target);
	const input = source.open(FileMode.ReadOnly);
	try {
		const total = source.size;
		let append = false;
		const copied = await copyInChunks({
			read: (length) => input.readBytes(length),
			write: (bytes) => {
				output.write(bytes, { append });
				append = true;
			},
			total,
			onProgress,
		});
		if (copied < total) throw new Error("The file was cut short");
	} finally {
		input.close();
	}
}

/** A half-written file is worse than none. */
export function discardDocument(target: string) {
	try {
		new File(target).delete();
	} catch {
		// Already gone, or the provider won't delete; nothing more to do.
	}
}
