import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

process.env.VITE_SERVER_URL ??= "http://localhost:3000";

const cache = await import("./reader-book-cache");
const getFile = mock(async (): Promise<Blob | undefined> => undefined);
const putFile = mock(async () => {});
const getReaderUrl = mock(async () => ({
	filename: "odyssey.pdf",
	url: "https://reader.test/odyssey.pdf",
}));
const download = mock(async () => new Response("%PDF-1.4 bytes"));

mock.module("./reader-book-cache", () => ({
	...cache,
	getCachedReaderBookFile: getFile,
	putCachedReaderBookFile: putFile,
}));
mock.module("@/utils/orpc", () => ({ client: { files: { getReaderUrl } } }));
const { loadPdfBytes } = await import("./load-pdf-bytes");

const originalFetch = globalThis.fetch;
afterAll(() => {
	globalThis.fetch = originalFetch;
});
beforeEach(() => {
	for (const fn of [getFile, putFile, getReaderUrl, download]) fn.mockClear();
	getFile.mockImplementation(async () => undefined);
	globalThis.fetch = download as unknown as typeof fetch;
});

const text = (buffer: ArrayBuffer) => new TextDecoder().decode(buffer);
const options = {
	uuid: "odyssey",
	serverId: "server",
	fileHash: "hash",
	onDownloadProgress: () => {},
};

describe("loadPdfBytes", () => {
	test("reopening a cached PDF never touches the network", async () => {
		getFile.mockImplementation(async () => new Blob(["cached pdf"]));

		expect(text(await loadPdfBytes(options))).toBe("cached pdf");
		expect(getReaderUrl).not.toHaveBeenCalled();
		expect(download).not.toHaveBeenCalled();
	});

	test("the first open downloads once with progress and fills the cache", async () => {
		const progress: (number | undefined)[] = [];

		const bytes = await loadPdfBytes({
			...options,
			fileSizeBytes: "%PDF-1.4 bytes".length,
			onDownloadProgress: (value) => progress.push(value),
		});

		expect(text(bytes)).toBe("%PDF-1.4 bytes");
		expect(download).toHaveBeenCalledTimes(1);
		expect(progress.at(-1)).toBe(1);
		expect(putFile).toHaveBeenCalledTimes(1);
	});

	test("a book without a content hash is read but not cached", async () => {
		await loadPdfBytes({ ...options, fileHash: null });

		expect(getFile).not.toHaveBeenCalled();
		expect(putFile).not.toHaveBeenCalled();
	});

	test("a failed download surfaces the status", async () => {
		download.mockImplementationOnce(
			async () => new Response("nope", { status: 403 }),
		);

		await expect(loadPdfBytes(options)).rejects.toThrow("status 403");
		expect(putFile).not.toHaveBeenCalled();
	});
});
