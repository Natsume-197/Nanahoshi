import * as fs from "node:fs/promises";
import path from "node:path";
import { type Job, Worker } from "bullmq";
import { logger } from "../../lib/logger";
import {
	isTaskCancelled,
	updateTaskOperationProgress,
} from "../../modules/taskManager";
import { existingAlignmentImporter } from "../../routers/read-listen/alignment-artifact";
import {
	createHonomiyaAlignCommand,
	resolveHonomiyaCliPath,
} from "../../routers/read-listen/honomiya-process";
import {
	type HonomiyaOperationProgress,
	operationProgressFromHonomiya,
	parseHonomiyaProgressLine,
} from "../../routers/read-listen/honomiya-progress";
import { readListenRepository } from "../../routers/read-listen/read-listen.repository";
import type { ReadListenGenerationJobData } from "../../routers/read-listen/read-listen-generation";
import { cleanupStagedTimedText } from "../../routers/read-listen/uploaded-alignment-input";
import { modalCredentialStore } from "../../routers/settings/modal-credentials";
import { getHonomiyaConfig } from "../../routers/settings/settings.service";
import { redis } from "../queue/redis";

const log = logger.child({ component: "read-listen-generation-worker" });
const CANCEL_POLL_MS = 1_000;
const MAX_ERROR_LENGTH = 2_000;

async function runHonomiya(
	command: string[],
	taskId: string,
	provider: "local" | "modal",
	onProgress: (progress: HonomiyaOperationProgress) => Promise<void>,
): Promise<{ stdout: string }> {
	const process = Bun.spawn(command, {
		stdout: "pipe",
		stderr: "pipe",
		env: await processEnv(provider),
	});
	let cancelled = false;
	const poll = setInterval(() => {
		isTaskCancelled(taskId)
			.then((value) => {
				if (!value || cancelled) return;
				cancelled = true;
				process.kill("SIGINT");
			})
			.catch(() => {});
	}, CANCEL_POLL_MS);

	try {
		const [exitCode, stdout, stderr] = await Promise.all([
			process.exited,
			new Response(process.stdout).text(),
			consumeHonomiyaStderr(process.stderr, onProgress),
		]);
		if (cancelled || exitCode === 130) {
			throw new DOMException("Honomiya generation was cancelled", "AbortError");
		}
		if (exitCode !== 0) {
			throw new Error(stderr.trim() || `Honomiya exited with code ${exitCode}`);
		}
		return { stdout };
	} finally {
		clearInterval(poll);
	}
}

async function consumeHonomiyaStderr(
	stream: ReadableStream<Uint8Array>,
	onProgress: (progress: HonomiyaOperationProgress) => Promise<void>,
): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const diagnostics: string[] = [];
	let pending = "";

	const consumeLine = async (rawLine: string) => {
		const line = rawLine.replace(/\r$/, "");
		if (!line) return;
		const event = parseHonomiyaProgressLine(line);
		if (event) {
			await onProgress(operationProgressFromHonomiya(event));
			return;
		}
		diagnostics.push(line);
	};

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		pending += decoder.decode(value, { stream: true });
		const lines = pending.split("\n");
		pending = lines.pop() ?? "";
		for (const line of lines) await consumeLine(line);
	}
	pending += decoder.decode();
	if (pending) await consumeLine(pending);
	return diagnostics.join("\n");
}

async function processEnv(
	provider: "local" | "modal",
): Promise<Record<string, string | undefined>> {
	return provider === "modal"
		? {
				...(await modalCredentialStore.environment()),
				HONOMIYA_PROVIDER: provider,
			}
		: { ...process.env, HONOMIYA_PROVIDER: provider };
}

async function processGeneration(job: Job<ReadListenGenerationJobData>) {
	const {
		pairUuid,
		serverId,
		taskId,
		ebookCatalogHash,
		audiobookCatalogHash,
		settings,
		mode,
		timedTextPaths,
		verifyTimedText,
	} = job.data;
	let lastProgress = "";
	const reportProgress = async (progress: HonomiyaOperationProgress) => {
		const signature = `${progress.phase}:${progress.percent}`;
		if (signature === lastProgress) return;
		lastProgress = signature;
		const results = await Promise.allSettled([
			job.updateProgress(progress),
			updateTaskOperationProgress(taskId, progress),
		]);
		for (const result of results) {
			if (result.status === "rejected") {
				log.warn(
					{
						err: result.reason,
						phase: progress.phase,
						percent: progress.percent,
						taskId,
					},
					"Could not publish Honomiya operation progress",
				);
			}
		}
	};
	await readListenRepository.updateGenerationStatus(taskId, "running");
	await reportProgress({ phase: "preparing", percent: 2 });
	const workDirectory = path.resolve(
		process.cwd(),
		"data",
		"alignments",
		"work",
		taskId,
	);
	const outputPath = path.join(workDirectory, "alignment.json");
	const cacheDir = path.resolve(
		process.cwd(),
		"data",
		"alignments",
		"cache",
		pairUuid,
	);

	try {
		const row = await readListenRepository.getPairRow(pairUuid, serverId);
		if (!row) throw new Error("Read & Listen pair no longer exists");
		const sources = await readListenRepository.getPairSources(
			row,
			serverId,
			"ALL",
		);
		if (!sources) throw new Error("Publication source files were not found");
		if (
			sources.ebookCatalogHash !== ebookCatalogHash ||
			sources.audiobookCatalogHash !== audiobookCatalogHash
		) {
			throw new Error(
				"Publication sources changed after generation was requested; start a new generation",
			);
		}

		await fs.mkdir(workDirectory, { recursive: true });
		if (!settings.enabled) {
			throw new Error(
				"Honomiya generation was disabled before this job started",
			);
		}
		const cliPath = await resolveHonomiyaCliPath(
			settings.cliPath ?? process.env.HONOMIYA_CLI_PATH,
		);
		if (mode === "timed-text" && !timedTextPaths?.length) {
			throw new Error("Timed-text generation lost its validated SRT sources");
		}
		const command = createHonomiyaAlignCommand({
			cliPath,
			ebookPath: sources.ebookPath,
			audioPaths: sources.audioPaths,
			outputPath,
			cacheDir,
			provider: settings.provider,
			quality: settings.quality,
			parallelChunks: settings.parallelChunks,
			retries: settings.retries,
			...(mode === "timed-text" && timedTextPaths ? { timedTextPaths } : {}),
			verifyTimedText,
		});
		const output = await runHonomiya(
			command,
			taskId,
			settings.provider,
			reportProgress,
		);
		log.info(
			{ pairUuid, taskId, output: output.stdout.trim() },
			"Honomiya alignment completed",
		);
		await reportProgress({ phase: "importing", percent: 95 });

		const imported = await existingAlignmentImporter.importGenerated(
			pairUuid,
			sources,
			outputPath,
			`${outputPath}.report.json`,
		);
		if (imported.outcome !== "imported") {
			throw new Error(`Generated alignment was rejected: ${imported.outcome}`);
		}
		await readListenRepository.upsertAlignment({
			pairId: pairUuid,
			...imported.artifact,
			ebookCatalogHash: sources.ebookCatalogHash,
			audiobookCatalogHash: sources.audiobookCatalogHash,
		});
		await reportProgress({ phase: "importing", percent: 99 });
		await readListenRepository.updateGenerationStatus(taskId, "completed");
		return { taskId, pairUuid };
	} catch (error) {
		const cancelled = error instanceof Error && error.name === "AbortError";
		const message = (
			error instanceof Error ? error.message : String(error)
		).slice(0, MAX_ERROR_LENGTH);
		await readListenRepository.updateGenerationStatus(
			taskId,
			cancelled ? "cancelled" : "failed",
			message,
		);
		throw error;
	} finally {
		await Promise.all([
			fs.rm(workDirectory, { recursive: true, force: true }).catch(() => {}),
			...(timedTextPaths
				? [cleanupStagedTimedText(timedTextPaths).catch(() => {})]
				: []),
		]);
	}
}

const initialConfig = await getHonomiyaConfig().catch(() => ({
	workerConcurrency: 1,
}));

export const readListenGenerationWorker = new Worker(
	"read-listen-generation",
	processGeneration,
	{ connection: redis, concurrency: initialConfig.workerConcurrency },
);

// BullMQ supports changing concurrency while the worker is running. Refresh it
// periodically so the global setting takes effect without restarting Nanahoshi.
const concurrencyRefresh = setInterval(() => {
	getHonomiyaConfig()
		.then((config) => {
			readListenGenerationWorker.concurrency = config.workerConcurrency;
		})
		.catch((error) =>
			log.warn({ err: error }, "Could not refresh Honomiya concurrency"),
		);
}, 30_000);
concurrencyRefresh.unref();

readListenGenerationWorker.on("failed", (job, error) => {
	log.error({ err: error, jobId: job?.id }, "Honomiya generation failed");
});
