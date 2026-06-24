import { BadRequestError } from "../../errors";
import { adminProcedure } from "../../index";
import { ranobedbImportQueue } from "../../infrastructure/queue/queues/ranobedb-import.queue";
import { isRanobedbReady } from "../../infrastructure/ranobedb/ranobedb.client";
import {
	checkPsqlAvailable,
	syncRanobedbAutoUpdate,
} from "../../modules/ranobedb/ranobedb.import";
import { createTask, deleteTask } from "../../modules/taskManager";
import { UpdateAmazonInput, UpdateRanobedbInput } from "./settings.model";
import { settingsRepository } from "./settings.repository";
import {
	type AmazonConfig,
	getAmazonConfig,
	getRanobedbConfig,
	setRanobedbConfig,
} from "./settings.service";

export const settingsRouter = {
	getAmazon: adminProcedure.handler(async (): Promise<AmazonConfig> => {
		return await getAmazonConfig();
	}),

	updateAmazon: adminProcedure
		.input(UpdateAmazonInput)
		.handler(async ({ input }) => {
			const normalizeCookie = (value?: string) => {
				if (!value) return undefined;
				const cleaned = value.replace(/^cookie:\s*/i, "").trim();
				return cleaned.length > 0 ? cleaned : undefined;
			};
			const normalizedInput = {
				...input,
				cookie: normalizeCookie(input.cookie),
			};
			const current = await getAmazonConfig();
			const updated: AmazonConfig = { ...current, ...normalizedInput };

			await settingsRepository.upsert("amazon", updated);

			return updated;
		}),

	getRanobedb: adminProcedure.handler(async () => {
		const [config, psqlAvailable, dbReady] = await Promise.all([
			getRanobedbConfig(),
			checkPsqlAvailable(),
			isRanobedbReady(),
		]);
		return { ...config, psqlAvailable, dbReady };
	}),

	updateRanobedb: adminProcedure
		.input(UpdateRanobedbInput)
		.handler(async ({ input }) => {
			const updated = await setRanobedbConfig(input);
			if (input.autoUpdate !== undefined) {
				await syncRanobedbAutoUpdate(input.autoUpdate);
			}
			return updated;
		}),

	importRanobedb: adminProcedure.handler(async () => {
		if (!(await checkPsqlAvailable())) {
			throw new BadRequestError(
				"psql not found on the server — install postgresql-client to import the RanobeDB dump",
			);
		}

		// Only one import at a time; clean up a stale finished singleton
		const existing = await ranobedbImportQueue.getJob(
			"ranobedb-import-singleton",
		);
		if (existing) {
			const state = await existing.getState();
			if (state === "completed" || state === "failed" || state === "unknown") {
				await existing.remove().catch(() => {});
			} else {
				return { started: false as const };
			}
		}

		const task = await createTask({
			type: "ranobedb-import",
			label: "Importing RanobeDB database",
			totalJobs: 100,
			sealed: true,
			queue: "ranobedb-import",
		});
		try {
			await ranobedbImportQueue.add(
				"import",
				{ taskId: task.id },
				{
					jobId: "ranobedb-import-singleton",
					removeOnComplete: true,
					removeOnFail: true,
				},
			);
		} catch (err) {
			await deleteTask(task.id);
			throw err;
		}

		return { started: true as const, taskId: task.id };
	}),
};
