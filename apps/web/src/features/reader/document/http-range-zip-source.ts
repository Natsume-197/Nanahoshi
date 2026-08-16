import type { ZipSource } from "@nanahoshi-v2/ebook-parser";

const CONTENT_RANGE = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i;

/**
 * Opens a ZIP-backed book without first downloading it all. The EPUB parser
 * asks this source for the end-of-file directory and then for individual
 * entries, which map one-to-one to HTTP byte ranges.
 */
export async function openHttpRangeZipSource(url: string): Promise<ZipSource> {
	const probe = await fetch(url, {
		credentials: "include",
		headers: { Range: "bytes=0-0" },
	});
	if (!probe.ok) {
		throw new Error(`Book request failed with status ${probe.status}`);
	}

	const contentRange = probe.headers.get("content-range");
	const match = contentRange?.match(CONTENT_RANGE);
	if (!match?.[3]) {
		// A proxy that strips Range can still hand us the whole file. Keep the
		// reader usable instead of attempting unreliable partial offsets.
		return await probe.blob();
	}
	await probe.body?.cancel();
	const size = Number(match[3]);
	if (!Number.isSafeInteger(size) || size <= 0) {
		throw new Error("Book server returned an invalid Content-Range");
	}

	const cache = new Map<string, Promise<Blob>>();
	return {
		size,
		slice(start = 0, end = size, type = "") {
			const from = Math.max(0, Math.min(size, start));
			const to = Math.max(from, Math.min(size, end));
			if (from === to) return new Blob([], { type });
			const key = `${from}:${to}:${type}`;
			let pending = cache.get(key);
			if (!pending) {
				pending = fetchRange(url, from, to, type);
				cache.set(key, pending);
			}
			return pending;
		},
	};
}

async function fetchRange(
	url: string,
	start: number,
	end: number,
	type: string,
): Promise<Blob> {
	const response = await fetch(url, {
		credentials: "include",
		headers: { Range: `bytes=${start}-${end - 1}` },
	});
	if (response.status !== 206) {
		throw new Error("Book server does not support byte-range reading");
	}
	const match = response.headers.get("content-range")?.match(CONTENT_RANGE);
	if (!match || Number(match[1]) !== start || Number(match[2]) !== end - 1) {
		throw new Error("Book server returned an unexpected byte range");
	}
	const blob = await response.blob();
	if (blob.size !== end - start) {
		throw new Error("Book server returned a truncated byte range");
	}
	return blob.slice(0, blob.size, type);
}
