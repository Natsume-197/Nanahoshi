import { afterEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Tests for the content-hash helpers.
 *
 * The upload endpoint hashes files in memory (hashContentBytes) while the
 * scanner/worker hash them from disk (calculateContentHash). They MUST produce
 * identical hashes or the (library_id, filehash) dedupe would never match an
 * uploaded file against a scanned one. These tests pin that parity.
 *
 * Run with:
 *   bun test packages/api/src/utils/__tests__/misc.test.ts
 */

// Mock env so importing misc (which pulls @nanahoshi-v2/env/server) doesn't
// trigger validation.
mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));

const { hashContentBytes, calculateContentHash } = await import("../misc");

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

describe("hashContentBytes", () => {
	test("is deterministic for identical content", () => {
		const a = hashContentBytes(new Uint8Array([1, 2, 3, 4, 5]));
		const b = hashContentBytes(new Uint8Array([1, 2, 3, 4, 5]));
		expect(a).toBe(b);
	});

	test("differs for different content", () => {
		const a = hashContentBytes(new Uint8Array([1, 2, 3]));
		const b = hashContentBytes(new Uint8Array([1, 2, 4]));
		expect(a).not.toBe(b);
	});

	test("matches calculateContentHash for a small file (whole-content path)", async () => {
		const bytes = new Uint8Array(1000).map((_, i) => i % 256);
		const filePath = await writeTemp(bytes);
		expect(hashContentBytes(bytes)).toBe(
			await calculateContentHash(filePath, bytes.byteLength),
		);
	});

	test("matches calculateContentHash for a large file (sampled path)", async () => {
		const size = 200 * 1024; // > 64KB so both use the size + head/tail sampling
		const bytes = new Uint8Array(size).map((_, i) => (i * 7) % 256);
		const filePath = await writeTemp(bytes);
		expect(hashContentBytes(bytes)).toBe(
			await calculateContentHash(filePath, size),
		);
	});
});
