import fs from "node:fs";

export class UploadTooLargeError extends Error {
	constructor(readonly maxBytes: number) {
		super(`Upload exceeds ${maxBytes} bytes`);
		this.name = "UploadTooLargeError";
	}
}

/**
 * Streams a request body to a new file, never holding more than a chunk in
 * memory. Stops as soon as the body passes `maxBytes`; on any failure the
 * partial file is removed. Returns the number of bytes written.
 */
export async function receiveUploadToFile(
	body: ReadableStream<Uint8Array>,
	dest: string,
	maxBytes: number,
): Promise<number> {
	// "wx" never clobbers: if the name is taken this throws before we own it.
	const handle = await fs.promises.open(dest, "wx");
	// Plain reader loop: Readable.fromWeb let a client disconnect escape as an
	// unhandled error instead of rejecting here.
	const reader = body.getReader();
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > maxBytes) throw new UploadTooLargeError(maxBytes);
			let offset = 0;
			while (offset < value.byteLength) {
				const { bytesWritten } = await handle.write(
					value,
					offset,
					value.byteLength - offset,
				);
				offset += bytesWritten;
			}
		}
		await handle.close();
		return size;
	} catch (err) {
		await reader.cancel().catch(() => undefined);
		await handle.close().catch(() => undefined);
		await fs.promises.rm(dest, { force: true });
		throw err;
	}
}
