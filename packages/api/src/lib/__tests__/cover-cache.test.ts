import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
	coverCacheFile,
	ensureCoverVariant,
	snapDim,
	snapQuality,
	WARM_QUALITY,
	WARM_WIDTHS,
	warmCoverVariants,
} from "../cover-cache";

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "cover-cache-test-"));
const cacheDir = path.join(scratchDir, "tmp");
const coverPath = path.join(scratchDir, "abc.jpg");
beforeAll(async () => {
	await sharp({
		create: {
			width: 900,
			height: 1300,
			channels: 3,
			background: { r: 120, g: 40, b: 200 },
		},
	})
		.jpeg()
		.toFile(coverPath);
});
afterAll(async () => {
	await fs.promises.rm(scratchDir, { recursive: true, force: true });
});
describe("snapDim", () => {
	test("snaps up to the next allowed bucket", () => {
		expect(snapDim(150)).toBe(200);
		expect(snapDim(200)).toBe(200);
		expect(snapDim(201)).toBe(300);
	});
	test("clamps above the ladder and rejects non-sizes", () => {
		expect(snapDim(9999)).toBe(2048);
		expect(snapDim(0)).toBe(0);
		expect(snapDim(-5)).toBe(0);
		expect(snapDim(Number.NaN)).toBe(0);
	});
});
describe("snapQuality", () => {
	test("snaps up, and clamps above the top bucket", () => {
		expect(snapQuality(80)).toBe(86);
		expect(snapQuality(95)).toBe(95);
		expect(snapQuality(100)).toBe(95);
	});
	test("defaults to 60 when absent", () => {
		expect(snapQuality(Number.NaN)).toBe(60);
	});
});
describe("coverCacheFile", () => {
	test("is stable for the same request", () => {
		expect(coverCacheFile("abc.jpg", 400, 0, 95, "avif")).toBe(
			"abc-400_0_q95_v3.avif",
		);
	});
	test("keys off the basename, whatever the path or source extension", () => {
		expect(coverCacheFile("abc.png", 400, 0, 95, "avif")).toBe(
			"abc-400_0_q95_v3.avif",
		);
		expect(coverCacheFile("/data/covers/abc.jpeg", 400, 0, 95, "avif")).toBe(
			"abc-400_0_q95_v3.avif",
		);
	});
	test("separates every axis that changes the bytes", () => {
		const keys = new Set([
			coverCacheFile("abc.jpg", 400, 0, 95, "avif"),
			coverCacheFile("abc.jpg", 300, 0, 95, "avif"),
			coverCacheFile("abc.jpg", 400, 200, 95, "avif"),
			coverCacheFile("abc.jpg", 400, 0, 60, "avif"),
			coverCacheFile("abc.jpg", 400, 0, 95, "jpeg"),
		]);
		expect(keys.size).toBe(5);
	});
});
describe("warm/serve parity", () => {
	test("warm widths and quality survive the serve route's snapping", () => {
		for (const w of WARM_WIDTHS) expect(snapDim(w)).toBe(w);
		expect(snapQuality(WARM_QUALITY)).toBe(WARM_QUALITY);
	});
	test("warming writes exactly the files the serve route would look up", async () => {
		const { warmed, failed } = await warmCoverVariants(coverPath, cacheDir);
		expect(failed).toBe(0);
		expect(warmed).toBe(WARM_WIDTHS.length);
		for (const width of WARM_WIDTHS) {
			const served = path.join(
				cacheDir,
				coverCacheFile(
					"abc.jpg",
					snapDim(width),
					snapDim(Number.NaN),
					snapQuality(WARM_QUALITY),
					"avif",
				),
			);
			expect(fs.existsSync(served)).toBe(true);
			expect(fs.statSync(served).size).toBeGreaterThan(0);
		}
	});
	test("warming again is a no-op", async () => {
		await warmCoverVariants(coverPath, cacheDir);
		const second = await warmCoverVariants(coverPath, cacheDir);
		expect(second).toEqual({ warmed: 0, failed: 0 });
	});
	test("an unreadable cover leaves no truncated variant behind", async () => {
		const broken = path.join(scratchDir, "broken.jpg");
		await fs.promises.writeFile(broken, "not an image");
		const { warmed, failed } = await warmCoverVariants(broken, cacheDir);
		expect(warmed).toBe(0);
		expect(failed).toBe(WARM_WIDTHS.length);
		for (const width of WARM_WIDTHS) {
			const p = path.join(
				cacheDir,
				coverCacheFile("broken.jpg", width, 0, WARM_QUALITY, "avif"),
			);
			expect(fs.existsSync(p)).toBe(false);
		}
	});
	test("a failed render is not left behind as a cache hit", async () => {
		const broken = path.join(scratchDir, "route.jpg");
		await fs.promises.writeFile(broken, "not an image");
		await expect(
			ensureCoverVariant({
				imagePath: broken,
				width: 400,
				quality: 95,
				format: "avif",
				cacheDir,
			}),
		).rejects.toThrow();
		expect(
			fs.existsSync(
				path.join(cacheDir, coverCacheFile("route.jpg", 400, 0, 95, "avif")),
			),
		).toBe(false);
	});
});
