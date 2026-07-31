import * as fs from "node:fs/promises";
import path from "node:path";
import { type Job, Worker } from "bullmq";
import {
	type CoverFormat,
	ensureCoverVariant,
	warmCoverVariants,
} from "../../lib/cover-cache";
import { coverKeyFromPath, ingestCover } from "../../lib/cover-store";
import { coverJobConcurrency } from "../../lib/image-concurrency";
import { logger } from "../../lib/logger";
import { backfillCoverIngest } from "../../modules/covers/cover-backfill";
import { audiobookMetadataRepository } from "../../routers/audiobooks/metadata/metadata.repository";
import { bookMetadataRepository } from "../../routers/books/metadata/metadata.repository";
import { redis } from "../queue/redis";
import { extractDominantColor } from "./cover-color";

const log = logger.child({ component: "cover-ingest-worker" });

export type CoverIngestJobData = {
	bookId: number;
	coverPath: string;
	mediaType?: "ebook" | "audiobook";
	taskId?: string;
};

/** A single rendition the serve route asked for but could not find warm. */
export type CoverRenditionJobData = {
	imagePath: string;
	width: number;
	quality: number;
	format: CoverFormat;
};

async function processIngest(job: Job<CoverIngestJobData>) {
	const { bookId, coverPath } = job.data;
	const repository =
		job.data.mediaType === "audiobook"
			? audiobookMetadataRepository
			: bookMetadataRepository;

	const fullPath = path.resolve(process.cwd(), coverPath);
	try {
		await fs.access(fullPath);
	} catch {
		return { bookId, skipped: true, reason: "cover file not found" };
	}

	const master = await ingestCover(coverPath, coverKeyFromPath(coverPath));
	// A source that cannot become a master (SVG, animated GIF, malformed bytes)
	// stays exactly as acquired and is still worth a colour and a warm pass.
	const servePath = master?.path ?? coverPath;
	const fullServePath = path.resolve(process.cwd(), servePath);

	let color: string | null = null;
	try {
		color = await extractDominantColor(fullServePath);
	} catch (err) {
		log.warn({ err, fullServePath }, "Skipping invalid cover for colour");
	}

	await repository.setCoverArtifacts(bookId, {
		...(master && master.path !== coverPath ? { cover: master.path } : {}),
		...(color ? { mainColor: color } : {}),
	});

	const { warmed, failed } = await warmCoverVariants(fullServePath);
	if (failed > 0) {
		log.warn({ fullServePath, failed }, "Some cover variants failed to render");
	}

	return {
		bookId,
		cover: servePath,
		color,
		reencoded: master?.reencoded ?? false,
		warmed,
		failed,
	};
}

async function processRendition(job: Job<CoverRenditionJobData>) {
	const { imagePath, width, quality, format } = job.data;
	const { rendered } = await ensureCoverVariant({
		imagePath,
		width,
		quality,
		format,
	});
	return { imagePath, width, rendered };
}

export const coverIngestWorker = new Worker(
	"cover-ingest",
	async (job: Job<CoverIngestJobData | CoverRenditionJobData>) => {
		if (job.name === "rendition") {
			return await processRendition(job as Job<CoverRenditionJobData>);
		}
		if (job.name === "backfill") {
			// Producer work belongs in the worker process, never in the API. It
			// returns no taskId on purpose: the producer is not one of the units
			// the task counts, only the ingest jobs it creates are.
			const enqueued = await backfillCoverIngest(
				(job.data as { taskId?: string }).taskId,
			);
			return { enqueued };
		}
		const typed = job as Job<CoverIngestJobData>;
		const result = await processIngest(typed);
		return { taskId: typed.data?.taskId, ...result };
	},
	{
		connection: redis,
		// Job concurrency and libvips threads multiply, so both take about half
		// the box: measured 203 ms/cover to warm a cover at cores/2 x cores/2,
		// against 840 ms at one thread and one job.
		concurrency: coverJobConcurrency(),
	},
);

coverIngestWorker.on("failed", (job, err) => {
	log.error({ err, jobId: job?.id }, "Failed job");
});
