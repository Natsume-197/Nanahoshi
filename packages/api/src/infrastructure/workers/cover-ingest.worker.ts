import * as fs from "node:fs/promises";
import path from "node:path";
import { type Job, Worker } from "bullmq";
import {
	type CoverFormat,
	coverRenditionJobId,
	ensureCoverVariant,
	warmCoverVariants,
} from "../../lib/cover-cache";
import {
	coverLadder,
	DEFERRED_WARM_WIDTHS,
	masterWidthFromFilename,
	WARM_QUALITY,
} from "../../lib/cover-ladder";
import { coverKeyFromPath, ingestCover } from "../../lib/cover-store";
import { coverJobConcurrency } from "../../lib/image-concurrency";
import { logger } from "../../lib/logger";
import { audiobookMetadataRepository } from "../../routers/audiobooks/metadata/metadata.repository";
import { bookMetadataRepository } from "../../routers/books/metadata/metadata.repository";
import { coverIngestQueue } from "../queue/queues/cover-ingest.queue";
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

// BullMQ processes the regular (priority 0) ingest and request jobs before
// positive-priority jobs. This keeps 600px retina/detail warming from slowing a
// scan while still completing it during idle queue time.
const DEFERRED_WARM_PRIORITY = 10;

async function enqueueDeferredWarmRenditions(
	imagePath: string,
): Promise<number> {
	const widths = coverLadder(
		DEFERRED_WARM_WIDTHS,
		masterWidthFromFilename(path.basename(imagePath)),
	);
	await Promise.all(
		widths.map((width) => {
			const format: CoverFormat = "avif";
			const jobId = coverRenditionJobId(
				imagePath,
				width,
				0,
				WARM_QUALITY,
				format,
			);
			return coverIngestQueue.add(
				"rendition",
				{ imagePath, width, quality: WARM_QUALITY, format },
				{
					jobId,
					priority: DEFERRED_WARM_PRIORITY,
					removeOnComplete: true,
					removeOnFail: 100,
				},
			);
		}),
	);
	return widths.length;
}

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
	const deferred = await enqueueDeferredWarmRenditions(fullServePath).catch(
		(err) => {
			// The cover is already usable after the immediate pass. A Redis outage
			// must not retry its expensive master/colour work merely to pre-render a
			// non-critical rendition.
			log.warn({ err, fullServePath }, "Deferred cover warm enqueue failed");
			return 0;
		},
	);

	return {
		bookId,
		cover: servePath,
		color,
		reencoded: master?.reencoded ?? false,
		warmed,
		failed,
		deferred,
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
