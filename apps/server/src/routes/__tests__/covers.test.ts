import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import sharp from "sharp";

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "covers-test-"));
const coversDir = path.join(scratchDir, "covers");
const tmpDir = path.join(scratchDir, "tmp");

mock.module("../../lib/paths", () => ({
	avatarsDir: path.join(scratchDir, "avatars"),
	headersDir: path.join(scratchDir, "headers"),
	serverLogosDir: path.join(scratchDir, "server-logos"),
	serverBackgroundsDir: path.join(scratchDir, "server-backgrounds"),
	coversDir,
	tmpDir,
}));

const { mountCovers } = await import("../covers");

const app = new Hono();
mountCovers(app);

beforeAll(async () => {
	await fs.promises.mkdir(coversDir, { recursive: true });
	await sharp({
		create: {
			width: 600,
			height: 900,
			channels: 3,
			background: { r: 120, g: 40, b: 200 },
		},
	})
		.jpeg()
		.toFile(path.join(coversDir, "test-cover.jpg"));
});

afterAll(async () => {
	await fs.promises.rm(scratchDir, { recursive: true, force: true });
});

describe("covers route", () => {
	test("resizes to AVIF by default", async () => {
		const res = await app.request(
			"/api/data/covers/test-cover.jpg?width=200&quality=60",
		);

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("image/avif");

		const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
		// sharp reports AVIF as heif
		expect(meta.format).toBe("heif");
		expect(meta.width).toBe(200);
	});

	test("snaps out-of-range quality into the AVIF buckets", async () => {
		const res = await app.request(
			"/api/data/covers/test-cover.jpg?width=128&quality=92",
		);

		expect(res.status).toBe(200);
		const cacheFile = path.join(tmpDir, "test-cover-128_0_q60_v3.avif");
		expect(fs.existsSync(cacheFile)).toBe(true);
	});

	test("keeps the jpeg fallback for OPDS clients", async () => {
		const res = await app.request(
			"/api/data/covers/test-cover.jpg?width=200&format=jpeg",
		);

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("image/jpeg");

		const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
		expect(meta.format).toBe("jpeg");
	});

	test("serves the stored file untouched when no resize is requested", async () => {
		const res = await app.request("/api/data/covers/test-cover.jpg");

		expect(res.status).toBe(200);
		const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
		expect(meta.format).toBe("jpeg");
		expect(meta.width).toBe(600);
	});

	test("rejects path traversal in the filename", async () => {
		const res = await app.request("/api/data/covers/..%2Fsecret.jpg?width=200");

		expect(res.status).toBe(400);
	});
});
