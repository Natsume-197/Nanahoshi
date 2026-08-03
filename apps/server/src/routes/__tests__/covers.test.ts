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

const enqueued: { name: string; data: unknown; opts: unknown }[] = [];
mock.module(
	"@nanahoshi-v2/api/infrastructure/queue/queues/cover-ingest.queue",
	() => ({
		coverIngestQueue: {
			add: async (name: string, data: unknown, opts: unknown) => {
				enqueued.push({ name, data, opts });
				return { id: "1" };
			},
		},
	}),
);

const { mountCovers } = await import("../covers");
const { warmCoverVariants } = await import("@nanahoshi-v2/api/lib/cover-cache");

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

	test("snaps an in-between quality up to the next AVIF bucket", async () => {
		const res = await app.request(
			"/api/data/covers/test-cover.jpg?width=128&quality=70",
		);

		expect(res.status).toBe(200);
		const cacheFile = path.join(tmpDir, "test-cover-128_0_q75_v3.avif");
		expect(fs.existsSync(cacheFile)).toBe(true);
	});

	test("clamps above-range quality to the top bucket, never downgrades", async () => {
		const res = await app.request(
			"/api/data/covers/test-cover.jpg?width=400&quality=92",
		);

		expect(res.status).toBe(200);
		expect(
			fs.existsSync(path.join(tmpDir, "test-cover-400_0_q95_v3.avif")),
		).toBe(true);
		expect(
			fs.existsSync(path.join(tmpDir, "test-cover-400_0_q60_v3.avif")),
		).toBe(false);
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

describe("wide misses stay off the request path", () => {
	// A cold 1200px AVIF costs ~2.25s to encode, and this route runs inside the
	// API process — the encode belongs to the worker.
	const wide = "wide-cover.jpg";

	beforeAll(async () => {
		await sharp({
			create: {
				width: 1400,
				height: 2100,
				channels: 3,
				background: { r: 30, g: 90, b: 160 },
			},
		})
			.jpeg()
			.toFile(path.join(coversDir, wide));
		await warmCoverVariants(path.join(coversDir, wide), tmpDir);
		enqueued.length = 0;
	});

	test("answers from a narrower warm rendition and queues the real one", async () => {
		const res = await app.request(
			`/api/data/covers/${wide}?width=1200&quality=95`,
		);

		expect(res.status).toBe(200);
		const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
		expect(meta.width).toBe(600);

		expect(enqueued).toHaveLength(1);
		expect(enqueued[0]?.name).toBe("rendition");
		expect(enqueued[0]?.data).toMatchObject({ width: 1200, quality: 95 });
	});

	test("does not let the browser keep a provisional answer", async () => {
		const res = await app.request(
			`/api/data/covers/${wide}?width=1200&quality=95`,
		);

		expect(res.headers.get("Cache-Control")).toBe("no-store");
	});

	test("dedupes the queued work per exact variant", async () => {
		enqueued.length = 0;
		await app.request(`/api/data/covers/${wide}?width=1200&quality=95`);
		await app.request(`/api/data/covers/${wide}?width=1200&quality=95`);

		const jobIds = new Set(
			enqueued.map((e) => (e.opts as { jobId?: string }).jobId),
		);
		expect(enqueued).toHaveLength(2);
		expect(jobIds.size).toBe(1);
		expect([...jobIds].every((id) => !id?.includes(":"))).toBe(true);
	});

	test("still encodes inline at widths the warm set covers", async () => {
		enqueued.length = 0;
		const res = await app.request(
			`/api/data/covers/${wide}?width=400&quality=95`,
		);

		expect(res.status).toBe(200);
		expect(res.headers.get("Cache-Control")).toContain("immutable");
		expect(enqueued).toHaveLength(0);
	});

	test("falls back to encoding inline when nothing is warm at all", async () => {
		enqueued.length = 0;
		const cold = "cold-cover.jpg";
		await sharp({
			create: {
				width: 1400,
				height: 2100,
				channels: 3,
				background: { r: 200, g: 40, b: 40 },
			},
		})
			.jpeg()
			.toFile(path.join(coversDir, cold));

		const res = await app.request(
			`/api/data/covers/${cold}?width=1200&quality=95`,
		);

		expect(res.status).toBe(200);
		expect(res.headers.get("Cache-Control")).toContain("immutable");
		const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
		expect(meta.width).toBe(1200);
	});
});
