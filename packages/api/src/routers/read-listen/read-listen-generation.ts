import { ConflictError } from "../../errors";
import { readListenGenerationQueue } from "../../infrastructure/queue/queues/read-listen-generation.queue";
import { createTask, failTask, getTask } from "../../modules/taskManager";
import type { HonomiyaConfig } from "../settings/settings.model";
import { getHonomiyaConfig } from "../settings/settings.service";
import {
	type ReadListenGenerationRow,
	readListenRepository,
} from "./read-listen.repository";

export type ReadListenGenerationJobData = {
	generationId: string;
	pairUuid: string;
	serverId: string;
	taskId: string;
	ebookCatalogHash: string;
	audiobookCatalogHash: string;
	settings: HonomiyaConfig;
};

type GenerationStore = Pick<
	typeof readListenRepository,
	"createGenerationAttempt" | "updateGenerationStatus"
>;

export type EnqueueReadListenGenerationInput = {
	pairUuid: string;
	serverId: string;
	requestedByUserId: string;
	ebookCatalogHash: string;
	audiobookCatalogHash: string;
	label: string;
};

export type EnqueueReadListenGenerationResult = {
	taskId: string;
	generation: ReadListenGenerationRow;
	reused: boolean;
};

export class ReadListenGenerationCoordinator {
	constructor(
		private readonly store: GenerationStore = readListenRepository,
		private readonly tasks = {
			create: createTask,
			fail: failTask,
			get: getTask,
		},
		private readonly queue: Pick<
			typeof readListenGenerationQueue,
			"add"
		> = readListenGenerationQueue,
		private readonly getConfig: () => Promise<HonomiyaConfig> = getHonomiyaConfig,
	) {}

	async enqueue(
		input: EnqueueReadListenGenerationInput,
	): Promise<EnqueueReadListenGenerationResult> {
		const config = await this.getConfig();
		if (!config.enabled) {
			throw new ConflictError(
				"Honomiya generation is disabled in instance settings",
			);
		}
		const taskId = crypto.randomUUID();
		const result = await this.store.createGenerationAttempt({
			pairId: input.pairUuid,
			taskId,
			provider: config.provider,
			quality: config.quality,
			requestedByUserId: input.requestedByUserId,
			ebookCatalogHash: input.ebookCatalogHash,
			audiobookCatalogHash: input.audiobookCatalogHash,
		});
		if (result.outcome === "already_running") {
			const existingTask = await this.tasks.get(result.generation.taskId);
			if (existingTask?.status === "running") {
				return {
					taskId: result.generation.taskId,
					generation: result.generation,
					reused: true,
				};
			}
			await this.store.updateGenerationStatus(
				result.generation.taskId,
				"failed",
				"Generation task was lost before completion",
			);
			return this.enqueue(input);
		}

		try {
			await this.tasks.create({
				id: taskId,
				type: "read-listen-generation",
				serverId: input.serverId,
				userId: input.requestedByUserId,
				label: input.label,
				totalJobs: 1,
				sealed: true,
				payload: {
					pairUuid: input.pairUuid,
					provider: config.provider,
					quality: config.quality,
				},
			});
			await this.queue.add(
				"generate",
				{
					generationId: result.generation.id,
					pairUuid: input.pairUuid,
					serverId: input.serverId,
					taskId,
					ebookCatalogHash: input.ebookCatalogHash,
					audiobookCatalogHash: input.audiobookCatalogHash,
					settings: config,
				} satisfies ReadListenGenerationJobData,
				{
					jobId: result.generation.id,
					// Honomiya retries individual chunks. Re-running the whole BullMQ job
					// could submit already-completed provider work unnecessarily.
					attempts: 1,
				},
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await Promise.all([
				this.store.updateGenerationStatus(taskId, "failed", message),
				this.tasks.fail(taskId, "Could not enqueue Honomiya"),
			]);
			throw error;
		}

		return { taskId, generation: result.generation, reused: false };
	}
}

export const readListenGenerationCoordinator =
	new ReadListenGenerationCoordinator();
