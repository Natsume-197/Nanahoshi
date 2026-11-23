import { ConflictError } from "../../errors";
import { readListenGenerationQueue } from "../../infrastructure/queue/queues/read-listen-generation.queue";
import { createTask, failTask, getTask } from "../../modules/taskManager";
import type { HonomiyaConfig } from "../settings/settings.model";
import { getHonomiyaConfig } from "../settings/settings.service";
import {
	type CtcEngineChoice,
	honomiyaModelManager,
	resolveCtcEngine,
} from "./honomiya-models";
import { resolveHonomiyaCliPath } from "./honomiya-process";
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
	mode: "provider" | "timed-text";
	timedTextPaths?: string[];
	verifyTimedText?: boolean;
	/** Set when a provider-mode generation aligns with the CTC engine. */
	ctc?: CtcEngineChoice;
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
	ebookLanguage?: string | null;
	mode?: "provider" | "timed-text";
	timedTextPaths?: string[];
	verifyTimedText?: boolean;
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
		private readonly chooseCtc: (
			config: HonomiyaConfig,
			language: string | null | undefined,
		) => Promise<CtcEngineChoice | null> = chooseCtcEngine,
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
		const mode = input.mode ?? "provider";
		const verifyTimedText =
			mode === "timed-text" && input.verifyTimedText === true;
		if (mode === "timed-text" && !input.timedTextPaths?.length) {
			throw new ConflictError(
				"Timed-text generation has no validated SRT sources",
			);
		}
		if (mode === "provider" && input.timedTextPaths !== undefined) {
			throw new ConflictError("Provider generation cannot include SRT sources");
		}
		const ctc =
			mode === "provider"
				? await this.chooseCtc(config, input.ebookLanguage)
				: null;
		const provider =
			mode === "timed-text" ? "timed-text" : ctc ? "ctc" : config.provider;
		const result = await this.store.createGenerationAttempt({
			pairId: input.pairUuid,
			taskId,
			provider,
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
					provider,
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
					mode,
					verifyTimedText,
					...(ctc ? { ctc } : {}),
					...(input.timedTextPaths
						? { timedTextPaths: input.timedTextPaths }
						: {}),
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

async function chooseCtcEngine(
	config: HonomiyaConfig,
	language: string | null | undefined,
): Promise<CtcEngineChoice | null> {
	if (config.engine === "whisper") return null;
	let models: Awaited<ReturnType<typeof honomiyaModelManager.list>> = [];
	try {
		const cliPath = await resolveHonomiyaCliPath(config.cliPath ?? undefined);
		models = await honomiyaModelManager.list(cliPath);
	} catch (error) {
		// An older CLI without `models` keeps the Whisper path working under auto.
		if (config.engine === "ctc") throw error;
	}
	return resolveCtcEngine({ preference: config.engine, language, models });
}

export const readListenGenerationCoordinator =
	new ReadListenGenerationCoordinator();
