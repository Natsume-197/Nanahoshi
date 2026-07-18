import { recommendationsQueue } from "../../infrastructure/queue/queues/recommendations.queue";
import { isRecommendationsEnabled } from "../../routers/settings/settings.service";
import { createTask, deleteTask, getActiveTasks } from "../taskManager";
import {
	REBUILD_JOB_PRIORITY,
	RECOMMENDATION_JOB_OPTS,
} from "./recommendation.scheduler";
import { recommendationComputeRepository } from "./recommendation-compute.repository";

export type RecommendationRebuildStartResult =
	| { started: true; count: number; taskId: string }
	| {
			started: false;
			count: 0;
			reason: "already-running" | "disabled" | "no-enabled-organizations";
	  };

const isRecommendationTask = (type: string) =>
	type === "recommendations-rebuild" ||
	type === "recommendations-rebuild-global" ||
	type === "recommendations-feeds";

// Rebuild and feeds refresh are mutually exclusive per server: the queue would
// serialize them anyway, and a feeds refresh queued behind a rebuild is
// redundant work (the rebuild recomputes every feed).
const isServerRecommendationTask = (
	task: { type: string; serverId?: string | null },
	serverId: string,
) =>
	(task.type === "recommendations-rebuild" ||
		task.type === "recommendations-feeds") &&
	task.serverId === serverId;

async function hasRunningServerRecTask(serverId: string): Promise<boolean> {
	return (await getActiveTasks()).some(
		(task) =>
			task.status === "running" &&
			(task.type === "recommendations-rebuild-global" ||
				isServerRecommendationTask(task, serverId)),
	);
}

export async function startServerRecommendationRebuild(
	serverId: string,
	userId?: string,
): Promise<RecommendationRebuildStartResult> {
	if (!(await isRecommendationsEnabled(serverId))) {
		return { started: false, count: 0, reason: "disabled" };
	}

	if (await hasRunningServerRecTask(serverId)) {
		return { started: false, count: 0, reason: "already-running" };
	}

	const task = await createTask({
		type: "recommendations-rebuild",
		serverId,
		totalJobs: 1,
		sealed: true,
		userId,
	});
	try {
		await recommendationsQueue.add(
			"rebuild-server",
			{ serverId, full: true, taskId: task.id },
			{
				...RECOMMENDATION_JOB_OPTS,
				jobId: `recs-manual-${task.id}-${serverId}`,
				priority: REBUILD_JOB_PRIORITY,
			},
		);
	} catch (error) {
		await deleteTask(task.id);
		throw error;
	}

	return { started: true, count: 1, taskId: task.id };
}

/**
 * Feeds-only refresh: recomputes every member's mixes from the persisted
 * similarity model without re-embedding or re-scoring the catalog. Orders of
 * magnitude cheaper than a rebuild — this is the button for "my activity
 * changed, refresh what I'm shown".
 */
export async function startServerRecommendationFeedsRefresh(
	serverId: string,
	userId?: string,
): Promise<RecommendationRebuildStartResult> {
	if (!(await isRecommendationsEnabled(serverId))) {
		return { started: false, count: 0, reason: "disabled" };
	}

	if (await hasRunningServerRecTask(serverId)) {
		return { started: false, count: 0, reason: "already-running" };
	}

	const task = await createTask({
		type: "recommendations-feeds",
		serverId,
		totalJobs: 1,
		sealed: true,
		userId,
	});
	try {
		// unprioritized on purpose: jumps ahead of any queued full rebuild
		await recommendationsQueue.add(
			"refresh-feeds",
			{ serverId, taskId: task.id },
			{
				...RECOMMENDATION_JOB_OPTS,
				jobId: `recs-feeds-${task.id}-${serverId}`,
			},
		);
	} catch (error) {
		await deleteTask(task.id);
		throw error;
	}

	return { started: true, count: 1, taskId: task.id };
}

export async function startGlobalRecommendationRebuild(
	userId?: string,
): Promise<RecommendationRebuildStartResult> {
	const alreadyRunning = (await getActiveTasks()).some(
		(task) => task.status === "running" && isRecommendationTask(task.type),
	);
	if (alreadyRunning) {
		return { started: false, count: 0, reason: "already-running" };
	}

	const organizationIds =
		await recommendationComputeRepository.listOrganizationIds();
	const enabled = await Promise.all(
		organizationIds.map(async (serverId) => ({
			serverId,
			enabled: await isRecommendationsEnabled(serverId),
		})),
	);
	const serverIds = enabled
		.filter((entry) => entry.enabled)
		.map((entry) => entry.serverId);
	if (serverIds.length === 0) {
		return {
			started: false,
			count: 0,
			reason: "no-enabled-organizations",
		};
	}

	const task = await createTask({
		type: "recommendations-rebuild-global",
		totalJobs: serverIds.length,
		sealed: true,
		userId,
	});
	try {
		await recommendationsQueue.addBulk(
			serverIds.map((serverId) => ({
				name: "rebuild-server",
				data: { serverId, full: true, taskId: task.id },
				opts: {
					...RECOMMENDATION_JOB_OPTS,
					jobId: `recs-manual-${task.id}-${serverId}`,
					priority: REBUILD_JOB_PRIORITY,
				},
			})),
		);
	} catch (error) {
		await deleteTask(task.id);
		throw error;
	}

	return { started: true, count: serverIds.length, taskId: task.id };
}
