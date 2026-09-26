import { afterEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Tests for the content-hash helpers. Uploads and the scanner both hash from
 * disk with calculateContentHash, so the (library_id, filehash) dedupe matches
 * an uploaded file against a scanned one.
 *
 * Run with:
 *   bun test packages/api/src/utils/__tests__/misc.test.ts
 */

// Mock env so importing misc (which pulls @nanahoshi/env/server) doesn't
// trigger validation.
mock.module("@nanahoshi/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));

const { calculateContentHash, isCurrentHashFormat } = await import("../misc");
const { generateDeterministicUUID } = await import("../misc");

const tmpFiles: string[] = [];
async function writeTemp(bytes: Uint8Array): Promise<string> {
	const p = path.join(os.tmpdir(), `nh-hash-${crypto.randomUUID()}.bin`);
	await fs.writeFile(p, bytes);
	tmpFiles.push(p);
	return p;
}

afterEach(async () => {
	await Promise.all(tmpFiles.splice(0).map((p) => fs.rm(p, { force: true })));
});

describe("calculateContentHash", () => {
	const hashOf = async (bytes: Uint8Array) =>
		calculateContentHash(await writeTemp(bytes), bytes.byteLength);

	test("is deterministic for identical content", async () => {
		const bytes = new Uint8Array([1, 2, 3, 4, 5]);
		expect(await hashOf(bytes)).toBe(await hashOf(bytes));
	});

	test("differs for different content", async () => {
		expect(await hashOf(new Uint8Array([1, 2, 3]))).not.toBe(
			await hashOf(new Uint8Array([1, 2, 4])),
		);
	});

	test("produces the current hash format", async () => {
		const hash = await hashOf(new Uint8Array([1, 2, 3]));
		expect(hash && isCurrentHashFormat(hash)).toBe(true);
		expect(isCurrentHashFormat("a".repeat(64))).toBe(false);
	});

	test("samples head and tail of large files, so a middle edit keeps the hash", async () => {
		const size = 200 * 1024;
		const a = new Uint8Array(size).map((_, i) => (i * 7) % 256);
		const b = a.slice();
		b[size / 2] = (b[size / 2] ?? 0) ^ 0xff;
		const c = a.slice();
		c[size - 1] = (c[size - 1] ?? 0) ^ 0xff;
		expect(await hashOf(a)).toBe(await hashOf(b));
		expect(await hashOf(a)).not.toBe(await hashOf(c));
	});
});

describe("generateDeterministicUUID", () => {
	test("is stable for identical inputs", () => {
		expect(generateDeterministicUUID(55, "book.epub", "s2:abc")).toBe(
			generateDeterministicUUID(55, "book.epub", "s2:abc"),
		);
	});

	// REGRESSION: the uuid used to derive only from (filename, hash), so the
	// same file in two libraries computed the same uuid and the insert crashed
	// on book_uuid_idx (which ON CONFLICT (library_id, filehash) doesn't cover).
	test("differs across libraries for the same file", () => {
		expect(generateDeterministicUUID(1, "book.epub", "s2:abc")).not.toBe(
			generateDeterministicUUID(2, "book.epub", "s2:abc"),
		);
	});

	test("differs for different content in the same library", () => {
		expect(generateDeterministicUUID(1, "book.epub", "s2:abc")).not.toBe(
			generateDeterministicUUID(1, "book.epub", "s2:def"),
		);
	});
});
