import { db } from "@nanahoshi-v2/db";
import { bookMetadata } from "@nanahoshi-v2/db/schema/general";
import { type Job, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import * as fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { redis } from "../queue/redis";

export type CoverColorJobData = {
	bookId: number;
	coverPath: string;
};

/**
 * Extracts the most vibrant/dominant color from an image file.
 * Resizes to 16x16 with sharp (< 1ms), then picks the pixel
 * with the highest saturation-weighted score. Falls back to
 * the average color for grayscale covers.
 */
async function extractDominantColor(filePath: string): Promise<string | null> {
	const { data } = await sharp(filePath)
		.resize(16, 16, { fit: "cover" })
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	let bestR = 0;
	let bestG = 0;
	let bestB = 0;
	let bestScore = -1;

	for (let i = 0; i < data.length; i += 3) {
		const r = data[i] ?? 0;
		const g = data[i + 1] ?? 0;
		const b = data[i + 2] ?? 0;

		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const saturation = max === 0 ? 0 : (max - min) / max;
		const lightness = (max + min) / 510; // normalized 0-1

		// Prefer saturated colors that aren't too dark or too bright
		const score = saturation * (1 - Math.abs(lightness - 0.45) * 2);

		if (score > bestScore) {
			bestScore = score;
			bestR = r;
			bestG = g;
			bestB = b;
		}
	}

	// If nothing saturated, fall back to average
	if (bestScore < 0.05) {
		let rSum = 0;
		let gSum = 0;
		let bSum = 0;
		const count = data.length / 3;
		for (let i = 0; i < data.length; i += 3) {
			rSum += (data[i] ?? 0);
			gSum += (data[i + 1] ?? 0);
			bSum += (data[i + 2] ?? 0);
		}
		bestR = Math.round(rSum / count);
		bestG = Math.round(gSum / count);
		bestB = Math.round(bSum / count);
	}

	return `#${bestR.toString(16).padStart(2, "0")}${bestG.toString(16).padStart(2, "0")}${bestB.toString(16).padStart(2, "0")}`;
}

async function processCoverColor(job: Job<CoverColorJobData>) {
	const { bookId, coverPath } = job.data;

	const fullPath = path.resolve(process.cwd(), coverPath);

	try {
		await fs.access(fullPath);
	} catch {
		return { bookId, skipped: true, reason: "cover file not found" };
	}

	const color = await extractDominantColor(fullPath);
	if (!color) {
		return { bookId, skipped: true, reason: "could not extract color" };
	}

	await db
		.update(bookMetadata)
		.set({ mainColor: color })
		.where(eq(bookMetadata.bookId, bookId));

	return { bookId, color };
}

export const coverColorWorker = new Worker("cover-color", processCoverColor, {
	connection: redis,
	concurrency: 4,
});

coverColorWorker.on("failed", (job, err) => {
	console.error(`[CoverColor] Failed job ${job?.id}`, err);
});
