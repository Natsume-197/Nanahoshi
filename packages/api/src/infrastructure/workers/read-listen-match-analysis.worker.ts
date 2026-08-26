import { type Job, Worker } from "bullmq";
import { getCurrentLibraryIdsForBookAction } from "../../auth/access.repository";
import { logger } from "../../lib/logger";
import {
	TaskCancelledError,
	throwIfTaskCancelled,
} from "../../modules/taskManager";
import { readListenRepository } from "../../routers/read-listen/read-listen.repository";
import type { ReadListenMatchAnalysisJobData } from "../../routers/read-listen/read-listen-match-analysis";
import { readListenProposalGeneration } from "../../routers/read-listen/read-listen-proposal-generation";
import { redis } from "../queue/redis";

const log = logger.child({ component: "read-listen-match-analysis-worker" });
const WORKER_CONCURRENCY = 4;

export async function processReadListenMatchAnalysisJob(
	job: Job<ReadListenMatchAnalysisJobData>,
) {
	const { analysisId, taskId, serverId, requestedByUserId, audiobookUuid } =
		job.data;
	await throwIfTaskCancelled(taskId);
	await readListenRepository.updateMatchAnalysisStatus(taskId, "running");

	try {
		const scope = await getCurrentLibraryIdsForBookAction(
			requestedByUserId,
			serverId,
			"editMetadata",
		);
		const audiobook = await readListenRepository.getPublicationByUuid(
			audiobookUuid,
			serverId,
			scope,
		);
		if (audiobook?.mediaType !== "audiobook") {
			await readListenRepository.recordMatchAnalysisJobOutcome({
				analysisId,
				audiobookUuid,
				outcome: "skipped",
			});
			return { taskId, analysisId, audiobookUuid, outcome: "skipped" };
		}

		await throwIfTaskCancelled(taskId);
		const proposals = await readListenProposalGeneration.generate({
			audiobookUuid,
			limit: 5,
			serverId,
			scope,
		});
		await readListenRepository.recordMatchAnalysisJobOutcome({
			analysisId,
			audiobookUuid,
			outcome: "completed",
			proposalCount: proposals.length,
		});
		return {
			taskId,
			analysisId,
			audiobookUuid,
			outcome: "completed",
			proposalCount: proposals.length,
		};
	} catch (error) {
		if (error instanceof TaskCancelledError) throw error;
		const maxAttempts = job.opts.attempts ?? 1;
		const terminal = job.attemptsMade + 1 >= maxAttempts;
		if (terminal) {
			const message = error instanceof Error ? error.message : String(error);
			await readListenRepository.recordMatchAnalysisJobOutcome({
				analysisId,
				audiobookUuid,
				outcome: "failed",
				error: message,
			});
			log.error(
				{ err: error, analysisId, audiobookUuid, taskId },
				"Read & Listen match analysis job failed",
			);
		}
		throw error;
	}
}

export const readListenMatchAnalysisWorker = new Worker(
	"read-listen-match-analysis",
	processReadListenMatchAnalysisJob,
	{
		connection: redis,
		concurrency: WORKER_CONCURRENCY,
	},
);
