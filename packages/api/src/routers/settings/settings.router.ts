import { BadRequestError } from "../../errors";
import { adminProcedure, requirePermission } from "../../index";
import { ranobedbImportQueue } from "../../infrastructure/queue/queues/ranobedb-import.queue";
import { isRanobedbReady } from "../../infrastructure/ranobedb/ranobedb.client";
import {
	checkPsqlAvailable,
	syncRanobedbAutoUpdate,
} from "../../modules/ranobedb/ranobedb.import";
import {
	LAST_RUN_KEY,
	type RecommendationLastRun,
} from "../../modules/recommendations/last-run";
import {
	startServerRecommendationFeedsRefresh,
	startServerRecommendationRebuild,
} from "../../modules/recommendations/recommendation.tasks";
import { createTask, deleteTask } from "../../modules/taskManager";
import {
	UpdateAmazonInput,
	UpdateRanobedbDumpInput,
	UpdateRanobedbInput,
	UpdateRecommendationsInput,
} from "./settings.model";
import { settingsRepository } from "./settings.repository";
import {
	type AmazonConfig,
	getAmazonConfig,
	getRanobedbConfig,
	getRanobedbDumpConfig,
	getRecommendationsConfig,
	setAmazonConfig,
	setRanobedbConfig,
	setRanobedbDumpConfig,
	setRecommendationsConfig,
} from "./settings.service";

export const settingsRouter = {
	// ── Amazon (per-organization) ───────────────────────────
	getAmazon: requirePermission("settings", "read").handler(
		async ({ context }): Promise<AmazonConfig> => {
			return await getAmazonConfig(context.serverId);
		},
	),

	updateAmazon: requirePermission("settings", "update")
		.input(UpdateAmazonInput)
		.handler(async ({ context, input }) => {
			const normalizeCookie = (value?: string) => {
				if (!value) return undefined;
				const cleaned = value.replace(/^cookie:\s*/i, "").trim();
				return cleaned.length > 0 ? cleaned : undefined;
			};
			const normalizedInput = {
				...input,
				cookie: normalizeCookie(input.cookie),
			};
			return await setAmazonConfig(context.serverId, normalizedInput);
		}),

	// ── RanobeDB provider toggle (per-organization) ─────────
	// Returns the per-org enabled flag plus read-only dump availability so the
	// org UI can warn when the shared dump hasn't been imported yet.
	getRanobedb: requirePermission("settings", "read").handler(
		async ({ context }) => {
			const [org, psqlAvailable, dbReady] = await Promise.all([
				getRanobedbConfig(context.serverId),
				checkPsqlAvailable(),
				isRanobedbReady(),
			]);
			return { ...org, psqlAvailable, dbReady };
		},
	),

	updateRanobedb: requirePermission("settings", "update")
		.input(UpdateRanobedbInput)
		.handler(async ({ context, input }) => {
			return await setRanobedbConfig(context.serverId, input);
		}),

	// ── Recommendations toggle (per-organization) ───────────
	getRecommendations: requirePermission("settings", "read").handler(
		async ({ context }) => {
			const [config, lastRun] = await Promise.all([
				getRecommendationsConfig(context.serverId),
				settingsRepository.getOrgValue<RecommendationLastRun>(
					context.serverId,
					LAST_RUN_KEY,
				),
			]);
			return { ...config, lastRun: lastRun ?? null };
		},
	),

	updateRecommendations: requirePermission("settings", "update")
		.input(UpdateRecommendationsInput)
		.handler(async ({ context, input }) => {
			return await setRecommendationsConfig(context.serverId, input);
		}),

	rebuildRecommendations: requirePermission("settings", "update").handler(
		async ({ context }) => {
			return startServerRecommendationRebuild(
				context.serverId,
				context.session.user.id,
			);
		},
	),

	refreshRecommendationFeeds: requirePermission("settings", "update").handler(
		async ({ context }) => {
			return startServerRecommendationFeedsRefresh(
				context.serverId,
				context.session.user.id,
			);
		},
	),

	// ── RanobeDB dump import (instance-global, app-owner) ────
	getRanobedbDump: adminProcedure.handler(async () => {
		const [dump, psqlAvailable, dbReady] = await Promise.all([
			getRanobedbDumpConfig(),
			checkPsqlAvailable(),
			isRanobedbReady(),
		]);
		return { ...dump, psqlAvailable, dbReady };
	}),

	updateRanobedbDump: adminProcedure
		.input(UpdateRanobedbDumpInput)
		.handler(async ({ input }) => {
			const updated = await setRanobedbDumpConfig(input);
			if (input.autoUpdate !== undefined) {
				await syncRanobedbAutoUpdate(input.autoUpdate);
			}
			return updated;
		}),

	importRanobedb: adminProcedure.handler(async ({ context }) => {
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

		// App-wide maintenance; the registry scopes it to app owners.
		const task = await createTask({
			type: "ranobedb-import",
			totalJobs: 100,
			sealed: true,
			userId: context.session.user.id,
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
