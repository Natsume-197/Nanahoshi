/**
 * Read a fetch `Response` into a Blob while reporting download progress (0–1)
 * as chunks arrive. Progress is throttled to whole-percent changes to avoid
 * excessive re-renders.
 *
 * The total size comes from the `Content-Length` header, falling back to
 * `fallbackTotal` (e.g. the size recorded in the book metadata) — the streaming
 * download endpoint may use chunked transfer encoding, which drops the header.
 * When no size is known, `onProgress(undefined)` is emitted once so the caller
 * can show an indeterminate state, and the stream is still consumed normally.
 */
export async function readBlobWithProgress(
	response: Response,
	onProgress: (progress: number | undefined) => void,
	fallbackTotal?: number,
): Promise<Blob> {
	// No body to stream (e.g. opaque/empty response): read it in one go. Done
	// before getReader() so the stream is never locked ahead of this fallback.
	if (!response.body) {
		onProgress(undefined);
		return response.blob();
	}

	const total =
		Number(response.headers.get("Content-Length")) || fallbackTotal || 0;
	if (!total) onProgress(undefined);

	const reader = response.body.getReader();
	const chunks: BlobPart[] = [];
	let received = 0;
	let lastPct = -1;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		received += value.length;
		if (total) {
			// Clamp: a fallback total is approximate and chunked bodies may
			// deliver slightly more than the header advertised.
			const pct = Math.min(100, Math.floor((received / total) * 100));
			if (pct !== lastPct) {
				lastPct = pct;
				onProgress(pct / 100);
			}
		}
	}

	return new Blob(chunks, {
		type: response.headers.get("Content-Type") || "application/octet-stream",
	});
}
