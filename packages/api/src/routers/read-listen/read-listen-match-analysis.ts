import { getCurrentLibraryIdsForBookAction } from "../../auth/access.repository";
import { readListenMatchAnalysisQueue } from "../../infrastructure/queue/queues/read-listen-match-analysis.queue";
import {
	createTask,
	failTask,
	finalizeTask,
	getTask,
} from "../../modules/taskManager";
import {
	type ReadListenMatchAnalysisRow,
	type ReadListenRepository,
	readListenRepository,
} from "./read-listen.repository";
import { READ_LISTEN_MATCHER_VERSION } from "./read-listen-matcher";

export type ReadListenMatchAnalysisJobData = {
	analysisId: string;
	taskId: string;
	serverId: string;
	requestedByUserId: string;
	audiobookUuid: string;
};

type AnalysisStore = Pick<
	ReadListenRepository,
	| "listUnevaluatedCanonicalAudiobooks"
	| "createMatchAnalysisAttempt"
	| "updateMatchAnalysisStatus"
>;

export type EnqueueReadListenMatchAnalysisResult = {
	taskId: string;
	analysis: ReadListenMatchAnalysisRow;
	reused: boolean;
};

/** Owns admission, reuse, task creation and fan-out for full match analysis. */
export class ReadListenMatchAnalysisCoordinator {
	constructor(
		private readonly store: AnalysisStore = readListenRepository,
		private readonly tasks = {
			create: createTask,
			fail: failTask,
			finalize: finalizeTask,
			get: getTask,
		},
		private readonly queue: Pick<
			typeof readListenMatchAnalysisQueue,
			"addBulk"
		> = readListenMatchAnalysisQueue,
		private readonly editableScope: (
			userId: string,
			serverId: string,
		) => Promise<number[] | "ALL"> = (userId, serverId) =>
			getCurrentLibraryIdsForBookAction(userId, serverId, "editMetadata"),
	) {}

	async enqueue(input: {
		serverId: string;
		requestedByUserId: string;
		label?: string;
	}): Promise<EnqueueReadListenMatchAnalysisResult> {
		const scope = await this.editableScope(
			input.requestedByUserId,
			input.serverId,
		);
		const candidates = await this.store.listUnevaluatedCanonicalAudiobooks(
			input.serverId,
			scope,
			READ_LISTEN_MATCHER_VERSION,
		);
		const taskId = crypto.randomUUID();
		const claim = await this.store.createMatchAnalysisAttempt({
			taskId,
			serverId: input.serverId,
			requestedByUserId: input.requestedByUserId,
			matcherVersion: READ_LISTEN_MATCHER_VERSION,
			candidateCount: candidates.length,
		});
		if (claim.reused) {
			const task = await this.tasks.get(claim.analysis.taskId);
			if (task?.status === "running") {
				return {
					taskId: claim.analysis.taskId,
					analysis: claim.analysis,
					reused: true,
				};
			}
			const claimAgeMs = Date.now() - Date.parse(claim.analysis.createdAt);
			if (claim.analysis.status === "queued" && claimAgeMs < 30_000) {
				return {
					taskId: claim.analysis.taskId,
					analysis: claim.analysis,
					reused: true,
				};
			}
			await this.store.updateMatchAnalysisStatus(
				claim.analysis.taskId,
				"failed",
				"Match analysis task was lost before completion",
			);
			return this.enqueue(input);
		}

		try {
			await this.tasks.create({
				id: taskId,
				type: "read-listen-match-analysis",
				serverId: input.serverId,
				userId: input.requestedByUserId,
				label: input.label,
				totalJobs: candidates.length,
				sealed: candidates.length > 0,
				payload: {
					analysisId: claim.analysis.id,
					matcherVersion: READ_LISTEN_MATCHER_VERSION,
				},
			});
			if (candidates.length === 0) {
				await Promise.all([
					this.store.updateMatchAnalysisStatus(taskId, "completed"),
					this.tasks.finalize(taskId),
				]);
			} else {
				await this.queue.addBulk(
					candidates.map((audiobook) => ({
						name: "analyze-audiobook",
						data: {
							analysisId: claim.analysis.id,
							taskId,
							serverId: input.serverId,
							requestedByUserId: input.requestedByUserId,
							audiobookUuid: audiobook.uuid,
						} satisfies ReadListenMatchAnalysisJobData,
						opts: {
							jobId: `${claim.analysis.id}-${audiobook.uuid}`,
							attempts: 2,
							backoff: { type: "exponential", delay: 1_000 },
						},
					})),
				);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await Promise.all([
				this.store.updateMatchAnalysisStatus(taskId, "failed", message),
				this.tasks.fail(taskId, "Could not enqueue Read & Listen analysis"),
			]);
			throw error;
		}

		return { taskId, analysis: claim.analysis, reused: false };
	}
}

export const readListenMatchAnalysisCoordinator =
	new ReadListenMatchAnalysisCoordinator();
