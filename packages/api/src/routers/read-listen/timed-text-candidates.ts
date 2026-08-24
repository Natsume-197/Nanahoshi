import * as fs from "node:fs/promises";
import path from "node:path";
import { BadRequestError } from "../../errors";

export type TimedTextTrackCandidates = {
	audioFileIndex: number;
	audioFilename: string;
	candidates: string[];
};

function isSafeSrtFilename(filename: string): boolean {
	return (
		filename === path.basename(filename) &&
		path.extname(filename).toLowerCase() === ".srt" &&
		filename.length <= 255
	);
}

export async function discoverTimedTextCandidates(
	audioPaths: string[],
): Promise<TimedTextTrackCandidates[]> {
	return Promise.all(
		audioPaths.map(async (audioPath, audioFileIndex) => {
			const directory = path.dirname(audioPath);
			const entries = await fs.readdir(directory, { withFileTypes: true });
			return {
				audioFileIndex,
				audioFilename: path.basename(audioPath),
				candidates: entries
					.filter((entry) => entry.isFile() && isSafeSrtFilename(entry.name))
					.map((entry) => entry.name)
					.sort((left, right) => left.localeCompare(right)),
			};
		}),
	);
}

export async function resolveTimedTextSelection(
	audioPaths: string[],
	filenames: string[],
): Promise<string[]> {
	if (filenames.length !== audioPaths.length) {
		throw new BadRequestError(
			"Select exactly one SRT file for every audiobook track",
		);
	}
	return Promise.all(
		audioPaths.map(async (audioPath, index) => {
			const filename = filenames[index];
			if (!filename || !isSafeSrtFilename(filename)) {
				throw new BadRequestError("Invalid timed-text filename");
			}
			const candidate = path.join(path.dirname(audioPath), filename);
			let stat: Awaited<ReturnType<typeof fs.lstat>>;
			try {
				stat = await fs.lstat(candidate);
			} catch {
				throw new BadRequestError(`Timed-text file was not found: ${filename}`);
			}
			if (!stat.isFile() || stat.isSymbolicLink()) {
				throw new BadRequestError(
					`Timed-text source is not a regular file: ${filename}`,
				);
			}
			return candidate;
		}),
	);
}
