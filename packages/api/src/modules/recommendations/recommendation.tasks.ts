import { recommendationsQueue } from "../../infrastructure/queue/queues/recommendations.queue";
import { isRecommendationsEnabled } from "../../routers/settings/settings.service";
import { createTask, deleteTask, getActiveTasks } from "../taskManager";
import { RECOMMENDATION_JOB_OPTS } from "./recommendation.scheduler";
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
	type === "recommendations-rebuild-global";

export async function startServerRecommendationRebuild(
	serverId: string,
	userId?: string,
): Promise<RecommendationRebuildStartResult> {
	if (!(await isRecommendationsEnabled(serverId))) {
		return { started: false, count: 0, reason: "disabled" };
	}

	const alreadyRunning = (await getActiveTasks()).some(
		(task) =>
			task.status === "running" &&
			(task.type === "recommendations-rebuild-global" ||
				(task.type === "recommendations-rebuild" &&
					task.serverId === serverId)),
	);
	if (alreadyRunning) {
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
				},
			})),
		);
	} catch (error) {
		await deleteTask(task.id);
		throw error;
	}

	return { started: true, count: serverIds.length, taskId: task.id };
}
