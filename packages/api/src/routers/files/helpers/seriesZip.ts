import { type FileHandle, open } from "node:fs/promises";
import path from "node:path";
import { Zip, ZipPassThrough } from "fflate";
import type { SeriesZipEntry } from "../file.service";

/**
 * Streams a zip of the given files. Entries use STORE (no compression) —
 * EPUB files are already deflate-compressed, so zipping them again only
 * burns CPU. Memory stays bounded: files are read sequentially and writes
 * respect the consumer's backpressure.
 */
export function createSeriesZipStream(
	entries: SeriesZipEntry[],
): ReadableStream<Uint8Array> {
	let controller: ReadableStreamDefaultController<Uint8Array>;

	const zip = new Zip((err, chunk, final) => {
		if (err) {
			controller.error(err);
			return;
		}
		controller.enqueue(chunk);
		if (final) controller.close();
	});

	const waitForDrain = async () => {
		while ((controller.desiredSize ?? 1) <= 0) {
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
	};

	const pump = async () => {
		for (const entry of entries) {
			let handle: FileHandle;
			try {
				handle = await open(entry.fullPath, "r");
			} catch {
				// The catalog can become stale between URL creation and streaming.
				// Skip a missing entry before writing its ZIP header.
				continue;
			}
			const file = new ZipPassThrough(entry.filename);
			zip.add(file);
			try {
				for await (const chunk of handle.createReadStream({
					autoClose: false,
				})) {
					await waitForDrain();
					file.push(new Uint8Array(chunk as Buffer));
				}
			} finally {
				await handle.close();
			}
			file.push(new Uint8Array(0), true);
		}
		zip.end();
	};

	return new ReadableStream<Uint8Array>({
		start(c) {
			controller = c;
			pump().catch((err) => controller.error(err));
		},
	});
}

/** Filesystem/header-safe download name with the extension from the source. */
export function downloadFilename(
	title: string | null | undefined,
	sourceFilename: string,
): string {
	if (!title?.trim()) return sourceFilename;
	const extension = path.extname(sourceFilename);
	const unsafeCharacters = '/\\:*?"<>|';
	const safeTitle = [...title]
		.map((character) => {
			const code = character.charCodeAt(0);
			return code < 32 || code === 127 || unsafeCharacters.includes(character)
				? " "
				: character;
		})
		.join("")
		.replace(/[. ]+$/g, "")
		.trim();
	if (!safeTitle) return sourceFilename;
	return extension && safeTitle.toLowerCase().endsWith(extension.toLowerCase())
		? safeTitle
		: `${safeTitle}${extension}`;
}

/** Filesystem/header-safe zip filename. */
export function zipFilename(name: string, fallback = "download"): string {
	return downloadFilename(name, `${fallback}.zip`);
}
