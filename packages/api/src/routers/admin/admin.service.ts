import { env } from "@nanahoshi-v2/env/server";
import { ensureDefaultRole } from "../../auth/access.repository";
import { BadRequestError } from "../../errors";
import { bookIndexQueue } from "../../infrastructure/queue/queues/book-index.queue";
import { coverIngestQueue } from "../../infrastructure/queue/queues/cover-ingest.queue";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import { logger } from "../../lib/logger";
import { startGlobalRecommendationRebuild } from "../../modules/recommendations/recommendation.tasks";
import { createTask } from "../../modules/taskManager";
import { adminRepository } from "./admin.repository";

const log = logger.child({ component: "admin-service" });

export async function getSystemStats() {
	const counts = await adminRepository.getSystemCounts();
	return {
		...counts,
		searchProvider: env.SEARCH_PROVIDER as "elasticsearch" | "pgroonga",
	};
}

export async function triggerRecommendationsRebuild(userId?: string) {
	return startGlobalRecommendationRebuild(userId);
}

export async function listUsers() {
	return adminRepository.listUsers();
}

export async function banUser(userId: string, reason?: string) {
	await adminRepository.banUser(userId, reason);
}

export async function unbanUser(userId: string) {
	await adminRepository.unbanUser(userId);
}

export async function deleteUser(userId: string, actingUserId: string) {
	if (userId === actingUserId) {
		throw new BadRequestError(
			"You cannot delete your own account from user management.",
		);
	}
	await adminRepository.deleteUser(userId);
}

export async function setUserRole(userId: string, role: "user" | "admin") {
	await adminRepository.setUserRole(userId, role);
}

export async function listServers() {
	return adminRepository.listServers();
}

export async function createServer(
	name: string,
	slug: string,
	creatorId: string,
) {
	const id = crypto.randomUUID();

	await adminRepository.createServer(id, name, slug, creatorId);

	// Seed the @everyone role so non-owner members get baseline permissions.
	await ensureDefaultRole(id);

	// New orgs get their recommendation schedules (and a first rebuild) now
	// instead of waiting for the next process restart's reconcile.
	const { enqueueRebuild, registerServerSchedules } = await import(
		"../../modules/recommendations/recommendation.scheduler"
	);
	await registerServerSchedules(id).catch(() => {});
	await enqueueRebuild(id).catch(() => {});

	return { id, name, slug };
}

export async function deleteServer(orgId: string) {
	await adminRepository.deleteServer(orgId);
}

export async function getOrgWithMembers(orgId: string) {
	return adminRepository.getOrgWithMembers(orgId);
}

export async function removeMember(memberId: string) {
	await adminRepository.removeMember(memberId);
}

export async function updateMemberRole(memberId: string, role: string) {
	await adminRepository.updateMemberRole(memberId, role);
}

/**
 * Enqueues a one-off full reindex job (books, series, authors) and creates a visible task entry.
 * No-op when using PGroonga (data is always in sync).
 */
/**
 * Puts cover art acquired before Cover Ingest existed through it: bounded to the
 * store ceiling, one format, and named after its real resolution. Until a cover
 * has been through it, it keeps exactly the behaviour it had before, so this is
 * a catch-up sweep that can be run, cancelled and re-run freely.
 */
export async function triggerCoverBackfill(): Promise<void> {
	// App-wide maintenance (all servers); the registry scopes it to app owners.
	const task = await createTask({ type: "cover-backfill" });
	// The producer loop runs as a job so the paging never touches the API process.
	await coverIngestQueue.add(
		"backfill",
		{ taskId: task.id },
		{ removeOnComplete: true, removeOnFail: false },
	);
}

export async function triggerBookReindex(): Promise<void> {
	if (!getSearchProvider().requiresSync()) {
		log.info("Search provider does not require sync, skipping reindex");
		return;
	}
	// App-wide maintenance (all servers); the registry scopes it to app owners.
	const task = await createTask({
		type: "book-reindex",
		totalJobs: 1,
		sealed: true,
	});
	await bookIndexQueue.add(
		"reindex",
		{ taskId: task.id },
		{
			removeOnComplete: true,
			removeOnFail: false,
		},
	);
}
