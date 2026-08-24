import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import { BadRequestError } from "../../errors";

export const MAX_ALIGNMENT_UPLOAD_BYTES = 64 * 1024 * 1024;
export const MAX_TIMED_TEXT_UPLOAD_BYTES = 16 * 1024 * 1024;
export const MAX_TIMED_TEXT_UPLOAD_TOTAL_BYTES = 64 * 1024 * 1024;

export type UploadedInput = {
	filename: string;
	bytes: Uint8Array;
};

function inputRoot(): string {
	return path.resolve(process.cwd(), "data", "alignments", "inputs");
}

function safeSrtName(filename: string): string {
	const base = path.basename(filename);
	if (
		!base ||
		base !== filename ||
		base === "." ||
		base === ".." ||
		base.length > 255 ||
		path.extname(base).toLowerCase() !== ".srt"
	) {
		throw new BadRequestError("Choose an SRT file for every audiobook track");
	}
	return base;
}

function validateUtf8Text(bytes: Uint8Array): void {
	if (bytes.length === 0)
		throw new BadRequestError("SRT files cannot be empty");
	try {
		new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new BadRequestError("SRT files must contain valid UTF-8 text");
	}
}

export function validateAlignmentUpload(input: UploadedInput): void {
	if (!input.filename.toLowerCase().endsWith(".honomiya.alignment.json")) {
		throw new BadRequestError("Choose a .honomiya.alignment.json file");
	}
	if (input.bytes.length === 0) {
		throw new BadRequestError("The Honomiya alignment file is empty");
	}
	if (input.bytes.length > MAX_ALIGNMENT_UPLOAD_BYTES) {
		throw new BadRequestError("The Honomiya alignment file exceeds 64 MB");
	}
}

export function validateAlignmentReportUpload(input: UploadedInput): void {
	if (!input.filename.toLowerCase().endsWith(".report.json")) {
		throw new BadRequestError("Choose a .report.json file");
	}
	if (
		input.bytes.length === 0 ||
		input.bytes.length > MAX_ALIGNMENT_UPLOAD_BYTES
	) {
		throw new BadRequestError(
			"The Honomiya report must be between 1 byte and 64 MB",
		);
	}
}

/**
 * Stores uploaded SRT inputs outside the source library until the asynchronous
 * Honomiya job consumes them. Every upload receives an isolated directory.
 */
export async function stageTimedTextUploads(
	pairUuid: string,
	expectedTracks: number,
	inputs: UploadedInput[],
): Promise<string[]> {
	if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(pairUuid)) {
		throw new BadRequestError("Invalid Read & Listen pair identifier");
	}
	if (inputs.length !== expectedTracks || expectedTracks === 0) {
		throw new BadRequestError(
			"Choose exactly one SRT file for every audiobook track",
		);
	}
	const totalBytes = inputs.reduce(
		(total, input) => total + input.bytes.length,
		0,
	);
	if (totalBytes > MAX_TIMED_TEXT_UPLOAD_TOTAL_BYTES) {
		throw new BadRequestError("The selected SRT files exceed 64 MB in total");
	}

	const uploadDirectory = path.join(inputRoot(), pairUuid, randomUUID());
	const staged: string[] = [];
	try {
		for (const [index, input] of inputs.entries()) {
			const filename = safeSrtName(input.filename);
			if (input.bytes.length > MAX_TIMED_TEXT_UPLOAD_BYTES) {
				throw new BadRequestError(`${filename} exceeds 16 MB`);
			}
			validateUtf8Text(input.bytes);
			const trackDirectory = path.join(uploadDirectory, String(index));
			await fs.mkdir(trackDirectory, { recursive: true });
			const target = path.join(trackDirectory, filename);
			await fs.writeFile(target, input.bytes, { flag: "wx" });
			staged.push(target);
		}
		return staged;
	} catch (error) {
		await fs
			.rm(uploadDirectory, { recursive: true, force: true })
			.catch(() => {});
		throw error;
	}
}

/** Removes only managed upload staging directories; library-side SRTs are untouched. */
export async function cleanupStagedTimedText(paths: string[]): Promise<void> {
	const root = inputRoot();
	const uploadDirectories = new Set<string>();
	for (const candidate of paths) {
		const resolved = path.resolve(candidate);
		if (!resolved.startsWith(`${root}${path.sep}`)) continue;
		const relative = path.relative(root, resolved).split(path.sep);
		if (relative.length < 4) continue;
		const [pairSegment, uploadSegment] = relative;
		if (!pairSegment || !uploadSegment) continue;
		uploadDirectories.add(path.join(root, pairSegment, uploadSegment));
	}
	await Promise.all(
		[...uploadDirectories].map((directory) =>
			fs.rm(directory, { recursive: true, force: true }),
		),
	);
}
