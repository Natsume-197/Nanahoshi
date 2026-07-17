import { createReadStream } from "node:fs";
import { Zip, ZipPassThrough } from "fflate";
import type { SeriesZipEntry } from "../file.service";

/**
 * Streams a zip of the given files. Entries use STORE (no compression) —
 * EPUB/AZW3 are already deflate-compressed, so zipping them again only
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
			const file = new ZipPassThrough(entry.filename);
			zip.add(file);
			for await (const chunk of createReadStream(entry.fullPath)) {
				await waitForDrain();
				file.push(new Uint8Array(chunk as Buffer));
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

/** Filesystem/header-safe zip filename. */
export function zipFilename(name: string, fallback = "download"): string {
	const safe = name.replace(/[/\\:*?"<>|]/g, " ").trim() || fallback;
	return `${safe}.zip`;
}
