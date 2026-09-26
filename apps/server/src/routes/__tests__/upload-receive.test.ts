import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { receiveUploadToFile, UploadTooLargeError } from "../upload-receive";

const dirs: string[] = [];
async function tempDir() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nh-upload-"));
	dirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })),
	);
});

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(chunk);
			controller.close();
		},
	});
}

describe("receiveUploadToFile", () => {
	test("writes every chunk to disk and reports the size", async () => {
		const dest = path.join(await tempDir(), "book.epub");
		const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])];

		expect(await receiveUploadToFile(streamOf(chunks), dest, 100)).toBe(5);
		expect([...(await fs.readFile(dest))]).toEqual([1, 2, 3, 4, 5]);
	});

	test("rejects a body over the limit and leaves no partial file", async () => {
		const dir = await tempDir();
		const dest = path.join(dir, "book.epub");
		const chunks = [new Uint8Array(60), new Uint8Array(60)];

		await expect(
			receiveUploadToFile(streamOf(chunks), dest, 100),
		).rejects.toBeInstanceOf(UploadTooLargeError);
		expect(await fs.readdir(dir)).toEqual([]);
	});

	test("removes the partial file when the client disconnects mid-transfer", async () => {
		const dir = await tempDir();
		const dest = path.join(dir, "book.epub");
		let sent = false;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (sent) throw new Error("connection reset");
				sent = true;
				controller.enqueue(new Uint8Array(10));
			},
		});

		await expect(receiveUploadToFile(body, dest, 100)).rejects.toThrow();
		expect(await fs.readdir(dir)).toEqual([]);
	});

	test("never clobbers a file that already has the name", async () => {
		const dir = await tempDir();
		const dest = path.join(dir, "book.epub");
		await fs.writeFile(dest, "original");

		await expect(
			receiveUploadToFile(streamOf([new Uint8Array(3)]), dest, 100),
		).rejects.toThrow();
		expect(await fs.readFile(dest, "utf8")).toBe("original");
	});
});
