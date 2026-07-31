import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
	coverCacheFile,
	ensureCoverVariant,
	findWarmFallback,
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
	test("stops at the rungs a narrow master can actually fill", async () => {
		// 250px master: every warm rung above it would be the same bytes under a
		// different name, so only the ones it can fill get written.
		const narrow = path.join(scratchDir, "narrow_w250.jpg");
		await sharp({
			create: {
				width: 250,
				height: 380,
				channels: 3,
				background: { r: 10, g: 90, b: 60 },
			},
		})
			.jpeg()
			.toFile(narrow);

		const { warmed, failed } = await warmCoverVariants(narrow, cacheDir);

		expect(failed).toBe(0);
		expect(warmed).toBe(3); // 128/200, then the master's own 250
		expect(
			fs.existsSync(
				path.join(
					cacheDir,
					coverCacheFile(narrow, 400, 0, WARM_QUALITY, "avif"),
				),
			),
		).toBe(false);
	});
});

describe("findWarmFallback", () => {
	test("offers the widest warm rendition below the requested width", async () => {
		await warmCoverVariants(coverPath, cacheDir);

		const fallback = await findWarmFallback(
			coverPath,
			1200,
			WARM_QUALITY,
			"avif",
			cacheDir,
		);

		expect(fallback).toBe(
			path.join(
				cacheDir,
				coverCacheFile("abc.jpg", 400, 0, WARM_QUALITY, "avif"),
			),
		);
	});

	test("uses a deferred rendition once the low-priority job has rendered it", async () => {
		await ensureCoverVariant({
			imagePath: coverPath,
			width: 600,
			quality: WARM_QUALITY,
			format: "avif",
			cacheDir,
		});

		expect(
			await findWarmFallback(coverPath, 1200, WARM_QUALITY, "avif", cacheDir),
		).toBe(
			path.join(
				cacheDir,
				coverCacheFile("abc.jpg", 600, 0, WARM_QUALITY, "avif"),
			),
		);
	});

	test("never offers a rendition at or above the requested width", async () => {
		await warmCoverVariants(coverPath, cacheDir);

		expect(
			await findWarmFallback(coverPath, 128, WARM_QUALITY, "avif", cacheDir),
		).toBeNull();
	});

	test("is null when nothing is warm yet", async () => {
		const cold = path.join(scratchDir, "cold.jpg");
		await fs.promises.copyFile(coverPath, cold);

		expect(
			await findWarmFallback(cold, 1200, WARM_QUALITY, "avif", cacheDir),
		).toBeNull();
	});
});
