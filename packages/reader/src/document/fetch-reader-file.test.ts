import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fetchReaderFile } from "./fetch-reader-file";

// WebViews answer file: XHRs with status 0, and a missing file with an empty body.
const files = new Map<string, Blob>();
class FileXhr {
	response: Blob | null = null;
	responseType = "";
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	private url = "";
	open(_method: string, url: string) {
		this.url = url;
	}
	send() {
		queueMicrotask(() => {
			this.response = files.get(this.url) ?? new Blob([]);
			this.onload?.();
		});
	}
	abort() {}
}

const originalXhr = globalThis.XMLHttpRequest;
beforeAll(() => {
	globalThis.XMLHttpRequest = FileXhr as unknown as typeof XMLHttpRequest;
});
afterAll(() => {
	globalThis.XMLHttpRequest = originalXhr;
});

describe("fetchReaderFile", () => {
	test("reads a downloaded book from a file URL with its size", async () => {
		files.set("file:///books/a.epub", new Blob(["epub bytes"]));

		const response = await fetchReaderFile("file:///books/a.epub");

		expect(response.headers.get("Content-Length")).toBe("10");
		expect(await response.text()).toBe("epub bytes");
	});

	test("rejects a file that is not on disk instead of opening an empty book", async () => {
		await expect(fetchReaderFile("file:///books/gone.epub")).rejects.toThrow(
			"missing",
		);
	});
});
