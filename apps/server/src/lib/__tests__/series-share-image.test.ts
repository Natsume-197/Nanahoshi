import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
	composeSeriesShareImage,
	ensureSeriesShareImage,
} from "../series-share-image";

const temporaryDirectories: string[] = [];

async function fixtureDirectory() {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "series-share-"));
	temporaryDirectories.push(directory);
	const colors = ["#dc5a4a", "#267a72", "#d5a83f"];
	const covers = await Promise.all(
		colors.map(async (color, index) => {
			const coverPath = path.join(directory, `cover-${index}.jpg`);
			await sharp({
				create: {
					width: 600,
					height: 900,
					channels: 3,
					background: color,
				},
			})
				.jpeg()
				.toFile(coverPath);
			return coverPath;
		}),
	);
	return { directory, covers };
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => fs.rm(directory, { recursive: true, force: true })),
	);
});

describe("series share image", () => {
	test("composes three ebook covers at Open Graph dimensions", async () => {
		const { covers } = await fixtureDirectory();
		const image = await composeSeriesShareImage(covers, "ebook");
		const metadata = await sharp(image).metadata();

		expect(metadata.format).toBe("jpeg");
		expect(metadata.width).toBe(1200);
		expect(metadata.height).toBe(630);
	});

	test("writes and reuses a versioned audiobook composite", async () => {
		const { directory, covers } = await fixtureDirectory();
		const cacheRoot = path.join(directory, "cache");
		const input = {
			uuid: "506e5ff3-e86f-56b8-8a45-736b306b17ab",
			mediaType: "audiobook" as const,
			coverFilenames: covers.map((cover) => path.basename(cover)),
			coverRoot: directory,
			cacheRoot,
		};

		const first = await ensureSeriesShareImage(input);
		const second = await ensureSeriesShareImage(input);
		expect(first).toBe(second);
		expect(first).not.toBeNull();
		const metadata = await sharp(first as string).metadata();
		expect(metadata.width).toBe(1200);
		expect(metadata.height).toBe(630);
	});
});
