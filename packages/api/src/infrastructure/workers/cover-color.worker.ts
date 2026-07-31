import * as fs from "node:fs/promises";
import path from "node:path";
import { type Job, Worker } from "bullmq";
import { logger } from "../../lib/logger";
import { audiobookMetadataRepository } from "../../routers/audiobooks/metadata/metadata.repository";
import { bookMetadataRepository } from "../../routers/books/metadata/metadata.repository";
import { coverWarmQueue } from "../queue/queues/cover-warm.queue";
import { redis } from "../queue/redis";
import { extractDominantColor } from "./cover-color";

const log = logger.child({ component: "cover-color-worker" });

export type CoverColorJobData = {
	bookId: number;
	coverPath: string;
	mediaType?: "ebook" | "audiobook";
	taskId?: string;
};

// SVG files can cause native crashes in libvips (unaligned chunk / segfault),
// so we skip them entirely — they don't have meaningful "dominant colors" anyway.
const UNSAFE_EXTENSIONS = new Set([".svg"]);

async function processCoverColor(job: Job<CoverColorJobData>) {
	const { bookId, coverPath } = job.data;

	const fullPath = path.resolve(process.cwd(), coverPath);
	const ext = path.extname(fullPath).toLowerCase();

	if (UNSAFE_EXTENSIONS.has(ext)) {
		return { bookId, skipped: true, reason: "svg files are not supported" };
	}

	try {
		await fs.access(fullPath);
	} catch {
		return { bookId, skipped: true, reason: "cover file not found" };
	}

	await coverWarmQueue
		.add("warm", { coverPath })
		.catch((err) => log.error({ err, bookId }, "Cover warm enqueue failed"));

	let color: string | null;
	try {
		color = await extractDominantColor(fullPath);
	} catch (err) {
		// Some extracted covers are malformed (e.g. invalid SVG/XML headers).
		// Skip them so one bad file does not fail the whole queue worker.
		log.warn({ err, fullPath }, "Skipping invalid cover for color extraction");
		return { bookId, skipped: true, reason: "invalid cover" };
	}
	if (!color) {
		return { bookId, skipped: true, reason: "could not extract color" };
	}

	if (job.data.mediaType === "audiobook") {
		await audiobookMetadataRepository.setMainColor(bookId, color);
	} else {
		await bookMetadataRepository.setMainColor(bookId, color);
	}

	return { bookId, color };
}

export const coverColorWorker = new Worker(
	"cover-color",
	async (job: Job<CoverColorJobData>) => {
		const result = await processCoverColor(job);
		return { taskId: job.data?.taskId, ...result };
	},
	{
		connection: redis,
		concurrency: 4,
	},
);

coverColorWorker.on("failed", (job, err) => {
	log.error({ err, jobId: job?.id }, "Failed job");
});
