import fs from "node:fs/promises";
import path from "node:path";
import { type Job, Worker } from "bullmq";
import { logger } from "../../lib/logger";
import { workerConcurrency } from "../../lib/worker-budget";
import {
	getEbookConvertCmd,
	isEbookConvertAvailable,
} from "../../modules/calibre";
import { getFileInfo } from "../../routers/files/file.service";
import { sendMail } from "../mail/mailer";
import { redis } from "../queue/redis";

const log = logger.child({ component: "send-to-kindle-worker" });

export type SendToKindleJobData = {
	bookUuid: string;
	kindleEmail: string;
	serverId: string;
	taskId: string;
};

const KINDLE_CONVERTED_DIR = path.join(process.cwd(), "data/kindle-tmp");

/**
 * Re-generates an EPUB via Calibre's ebook-convert (epub → epub).
 * This strips DRM artifacts, fixes encoding, and produces a clean EPUB
 * that Amazon's Send to Kindle can process.
 * This is a MUST as Amazon is very strict about EPUB formatting and often rejects files that work fine on other readers.
 * Returns the path to the converted file, or null if conversion isn't available.
 */
async function reconvertEpub(
	sourcePath: string,
	jobId: string,
): Promise<string | null> {
	if (!isEbookConvertAvailable()) return null;

	await fs.mkdir(KINDLE_CONVERTED_DIR, { recursive: true });
	const outputPath = path.join(KINDLE_CONVERTED_DIR, `${jobId}.epub`);

	const proc = Bun.spawn([...getEbookConvertCmd(), sourcePath, outputPath], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const TIMEOUT_MS = 5 * 60 * 1000;
	const exitCode = await Promise.race([
		proc.exited,
		new Promise<never>((_, reject) =>
			setTimeout(() => {
				proc.kill();
				reject(new Error("[SendToKindle] ebook-convert timed out"));
			}, TIMEOUT_MS),
		),
	]);

	if (exitCode !== 0) {
		await fs.unlink(outputPath).catch(() => {});
		const stderr = await new Response(proc.stderr).text();
		log.warn({ exitCode, stderr }, "ebook-convert failed");
		return null;
	}

	const stat = await fs.stat(outputPath).catch(() => null);
	if (!stat || stat.size === 0) {
		await fs.unlink(outputPath).catch(() => {});
		return null;
	}

	return outputPath;
}

async function processSendToKindle(job: Job<SendToKindleJobData>) {
	const { bookUuid, kindleEmail, serverId, taskId } = job.data;

	const file = await getFileInfo(bookUuid, serverId);
	if (!file) {
		throw new Error(`File not found for book ${bookUuid}`);
	}

	const stat = await fs.stat(file.fullPath);
	if (stat.size === 0) {
		throw new Error(`File is empty: ${file.fullPath}`);
	}

	let sendPath = file.fullPath;
	let tempPath: string | null = null;

	try {
		// Re-generate EPUB via Calibre for maximum Kindle compatibility
		if (file.filename.toLowerCase().endsWith(".epub")) {
			log.info({ filename: file.filename }, "Re-converting via Calibre");
			const converted = await reconvertEpub(
				file.fullPath,
				job.id ?? crypto.randomUUID(),
			);
			if (converted) {
				sendPath = converted;
				tempPath = converted;
				log.info({ converted }, "Converted EPUB ready");
			} else {
				log.info("Calibre not available, sending original");
			}
		}

		log.info(
			{ filename: file.filename, size: stat.size, kindleEmail },
			"Sending to Kindle",
		);

		await sendMail({
			to: kindleEmail,
			subject: file.filename,
			text: `${file.filename} — sent from Nanahoshi.`,
			attachments: [
				{
					filename: file.filename,
					path: sendPath,
				},
			],
		});

		log.info(
			{ filename: file.filename, kindleEmail },
			"Successfully sent to Kindle",
		);
		// taskId rides the return value so the progress listener counts this send;
		// a thrown error is counted as a terminal failure by the same listener.
		return { taskId, bookUuid, kindleEmail, filename: file.filename };
	} finally {
		if (tempPath) {
			await fs.unlink(tempPath).catch(() => {});
		}
	}
}

export const sendToKindleWorker = new Worker(
	"send-to-kindle",
	processSendToKindle,
	{
		connection: redis,
		concurrency: workerConcurrency(1),
	},
);

sendToKindleWorker.on("failed", (job, err) => {
	log.error({ err, jobId: job?.id }, "Failed job");
});
