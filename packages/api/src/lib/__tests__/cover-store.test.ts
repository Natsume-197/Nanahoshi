import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { COVER_STORE_MAX_DIM } from "../cover-ladder";

// cover-store resolves data/covers off cwd, so the whole suite runs from a
// scratch cwd rather than writing into the developer's real library.
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "cover-store-test-"));
const originalCwd = process.cwd();
process.chdir(scratchDir);

const {
	acquireCover,
	acquireCoverFromFile,
	coverKeyFromPath,
	coversDir,
	findAcquiredCover,
	ingestCover,
	masterName,
	upgradeAmazonImageUrl,
} = await import("../cover-store");

async function makeImage(
	width: number,
	height: number,
	format: "jpeg" | "png" = "jpeg",
): Promise<Buffer> {
	const pipeline = sharp({
		create: {
			width,
			height,
			channels: 3,
			background: { r: 120, g: 40, b: 200 },
		},
	});
	return format === "png"
		? await pipeline.png().toBuffer()
		: await pipeline.jpeg().toBuffer();
}

beforeAll(async () => {
	await fs.promises.mkdir(coversDir, { recursive: true });
});

afterAll(async () => {
	process.chdir(originalCwd);
	await fs.promises.rm(scratchDir, { recursive: true, force: true });
});

describe("acquire", () => {
	test("writes the bytes untouched — the scan path must not decode", async () => {
		const bytes = await makeImage(900, 1300);
		const stored = await acquireCover(bytes, "acq-1", ".jpg");

		expect(stored).toBe(path.join("data", "covers", "acq-1.jpg"));
		const onDisk = await fs.promises.readFile(path.resolve(stored as string));
		expect(onDisk.byteLength).toBe(bytes.byteLength);
	});

	test("falls back to .jpg for an extension we would not trust in a path", async () => {
		const stored = await acquireCover(await makeImage(50, 50), "acq-2", "");
		expect(stored?.endsWith("acq-2.jpg")).toBe(true);

		const traversal = await acquireCover(
			await makeImage(50, 50),
			"acq-3",
			"./../evil",
		);
		expect(traversal?.endsWith("acq-3.jpg")).toBe(true);
	});

	test("never truncates art that is already on disk", async () => {
		const first = await makeImage(400, 600);
		await acquireCover(first, "acq-4", ".jpg");
		await acquireCover(await makeImage(80, 80), "acq-4", ".jpg");

		const onDisk = await fs.promises.readFile(
			path.join(coversDir, "acq-4.jpg"),
		);
		expect(onDisk.byteLength).toBe(first.byteLength);
	});

	test("copies a file that is already on disk", async () => {
		const source = path.join(scratchDir, "beside-the-audio.png");
		await fs.promises.writeFile(source, await makeImage(300, 300, "png"));

		const stored = await acquireCoverFromFile(source, "acq-5");
		expect(stored?.endsWith("acq-5.png")).toBe(true);
		expect(fs.existsSync(path.join(coversDir, "acq-5.png"))).toBe(true);
	});
});

describe("findAcquiredCover", () => {
	test("finds art already held under any acquisition extension", async () => {
		await acquireCover(await makeImage(100, 100, "png"), "find-1", ".png");
		expect(await findAcquiredCover("find-1")).toBe(
			path.join("data", "covers", "find-1.png"),
		);
	});

	test("is null when nothing has been acquired", async () => {
		expect(await findAcquiredCover("find-missing")).toBeNull();
	});
});

describe("ingestCover", () => {
	test("bounds an oversized cover and names it after its real width", async () => {
		const stored = await acquireCover(
			await makeImage(2400, 3600),
			"ing-1",
			".jpg",
		);
		const master = await ingestCover(stored as string, "ing-1");

		expect(master).not.toBeNull();
		// 2400x3600 scaled down so the long edge lands on the ceiling.
		expect(master?.height).toBe(COVER_STORE_MAX_DIM);
		expect(master?.width).toBe(Math.round((COVER_STORE_MAX_DIM * 2400) / 3600));
		expect(master?.reencoded).toBe(true);
		expect(path.basename(master?.path ?? "")).toBe(
			masterName(
				"ing-1",
				Math.round((COVER_STORE_MAX_DIM * 2400) / 3600),
				".jpg",
			),
		);
		expect(fs.existsSync(path.resolve(master?.path as string))).toBe(true);
	});

	test("removes the acquired file once a master replaces it", async () => {
		const stored = await acquireCover(
			await makeImage(2000, 2000),
			"ing-2",
			".jpg",
		);
		await ingestCover(stored as string, "ing-2");

		expect(fs.existsSync(path.join(coversDir, "ing-2.jpg"))).toBe(false);
	});

	test("renames a conformant jpeg instead of paying a re-encode", async () => {
		const stored = await acquireCover(
			await makeImage(800, 1200),
			"ing-3",
			".jpg",
		);
		const before = fs.statSync(path.resolve(stored as string)).size;
		const master = await ingestCover(stored as string, "ing-3");

		expect(master?.reencoded).toBe(false);
		expect(master?.width).toBe(800);
		expect(fs.statSync(path.resolve(master?.path as string)).size).toBe(before);
	});

	test("re-encodes a non-jpeg source even when it is within the ceiling", async () => {
		const stored = await acquireCover(
			await makeImage(500, 700, "png"),
			"ing-4",
			".png",
		);
		const master = await ingestCover(stored as string, "ing-4");

		expect(master?.reencoded).toBe(true);
		expect(path.extname(master?.path ?? "")).toBe(".jpg");
		expect(master?.width).toBe(500);
	});

	test("is idempotent — re-ingesting a master neither stacks markers nor loses it", async () => {
		const stored = await acquireCover(
			await makeImage(700, 1000),
			"ing-5",
			".jpg",
		);
		const first = await ingestCover(stored as string, "ing-5");
		const second = await ingestCover(
			first?.path as string,
			coverKeyFromPath(first?.path as string),
		);

		expect(second?.path).toBe(first?.path);
		expect(path.basename(second?.path ?? "")).toBe(
			masterName("ing-5", 700, ".jpg"),
		);
		expect(fs.existsSync(path.resolve(first?.path as string))).toBe(true);
	});

	test("leaves an uningestible source exactly where it was acquired", async () => {
		const svgPath = path.join(coversDir, "ing-6.svg");
		await fs.promises.writeFile(svgPath, "<svg xmlns='x'/>");

		expect(await ingestCover("data/covers/ing-6.svg", "ing-6")).toBeNull();
		expect(fs.existsSync(svgPath)).toBe(true);
	});

	test("leaves malformed bytes alone rather than writing a truncated master", async () => {
		const brokenPath = path.join(coversDir, "ing-7.jpg");
		await fs.promises.writeFile(brokenPath, "not an image");

		expect(await ingestCover("data/covers/ing-7.jpg", "ing-7")).toBeNull();
		expect(fs.existsSync(brokenPath)).toBe(true);
		expect(
			fs.readdirSync(coversDir).filter((f) => f.startsWith("ing-7_w")),
		).toEqual([]);
	});
});

describe("coverKeyFromPath", () => {
	test("strips the resolution marker so re-ingest re-derives the same name", () => {
		expect(coverKeyFromPath("data/covers/abc-uuid_w1350.jpg")).toBe("abc-uuid");
		expect(coverKeyFromPath("data/covers/abc-uuid.jpg")).toBe("abc-uuid");
	});
});

describe("upgradeAmazonImageUrl", () => {
	test("upgrades the 500px rendition Audnexus hands us", () => {
		expect(
			upgradeAmazonImageUrl(
				"https://m.media-amazon.com/images/I/51abc._SL500_.jpg",
			),
		).toBe(
			`https://m.media-amazon.com/images/I/51abc._SL${COVER_STORE_MAX_DIM}_.jpg`,
		);
	});

	test.each(["SX", "SY", "SS", "UX", "UY", "AC"])(
		"upgrades the %s rendition modifier too",
		(modifier) => {
			const out = upgradeAmazonImageUrl(
				`https://m.media-amazon.com/images/I/51abc._${modifier}300_.jpg`,
			);

			expect(out).toContain(`._SL${COVER_STORE_MAX_DIM}_.`);
			expect(out).not.toContain("300");
		},
	);

	test("handles comma-separated crop modifiers", () => {
		expect(
			upgradeAmazonImageUrl(
				"https://m.media-amazon.com/images/I/51abc._CR0,0,300,300_.jpg",
			),
		).toBe(
			`https://m.media-amazon.com/images/I/51abc._SL${COVER_STORE_MAX_DIM}_.jpg`,
		);
	});

	test("leaves an unmodified url alone — it is already full size", () => {
		const url = "https://m.media-amazon.com/images/I/51abc.jpg";

		expect(upgradeAmazonImageUrl(url)).toBe(url);
	});

	test("never shrinks a rendition that is already larger", () => {
		// Rewriting this down to our own ceiling would throw away pixels the
		// provider was willing to hand over.
		const url = "https://m.media-amazon.com/images/I/51abc._SL3000_.jpg";

		expect(upgradeAmazonImageUrl(url)).toBe(url);
	});

	test("requests at least what the largest layout slot needs", () => {
		// detail preset tops out at a 1200px bucket; stored art must clear it.
		expect(COVER_STORE_MAX_DIM).toBeGreaterThanOrEqual(1200);
	});
});
