import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const getRawEpub = mock(
	async (_uuid: string): Promise<Blob | undefined> => undefined,
);
const putRawEpub = mock(
	async (_uuid: string, _blob: Blob, _maxCached?: number): Promise<void> => {},
);
const getSignedDownloadUrl = mock(async (_input: { uuid: string }) => ({
	url: "https://example.test/book.epub",
}));

mock.module("./epub-store", () => ({ getRawEpub, putRawEpub }));
mock.module("@/utils/orpc", () => ({
	client: { files: { getSignedDownloadUrl } },
}));

const originalFetch = globalThis.fetch;
const fetchBook = mock(
	async (_input: RequestInfo | URL) =>
		new Response("epub bytes", {
			status: 200,
			headers: { "Content-Length": "10" },
		}),
);
globalThis.fetch = fetchBook as unknown as typeof fetch;

const { createStoragePort } = await import("./ports");

beforeEach(() => {
	getRawEpub.mockReset();
	getRawEpub.mockResolvedValue(undefined);
	putRawEpub.mockReset();
	putRawEpub.mockResolvedValue(undefined);
	getSignedDownloadUrl.mockClear();
	fetchBook.mockClear();
});

afterAll(() => {
	globalThis.fetch = originalFetch;
});

describe("Lumi storage port", () => {
	it("serves cached EPUBs without a network request", async () => {
		const cached = new Blob(["cached"]);
		getRawEpub.mockResolvedValue(cached);

		await expect(createStoragePort().loadBookFile("book")).resolves.toBe(
			cached,
		);
		expect(fetchBook).not.toHaveBeenCalled();
	});

	it("falls back to the network when IndexedDB cannot be read", async () => {
		getRawEpub.mockRejectedValue(new Error("IndexedDB blocked"));

		const result = await createStoragePort().loadBookFile("book");
		expect(await result?.text()).toBe("epub bytes");
		expect(fetchBook).toHaveBeenCalledTimes(1);
	});

	it("does not wait for cache maintenance before returning the download", async () => {
		putRawEpub.mockImplementation(() => new Promise(() => {}));

		const result = await createStoragePort(undefined, () => 3).loadBookFile(
			"book",
		);
		expect(await result?.text()).toBe("epub bytes");
		expect(putRawEpub).toHaveBeenCalledWith("book", result, 3);
	});
});
