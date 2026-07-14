import { env } from "@nanahoshi-v2/env/server";
import { ensureDefaultRole } from "../../auth/access.repository";
import { bookIndexQueue } from "../../infrastructure/queue/queues/book-index.queue";
import { coverColorQueue } from "../../infrastructure/queue/queues/cover-color.queue";
import { metadataEnrichQueue } from "../../infrastructure/queue/queues/metadata-enrich.queue";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import { logger } from "../../lib/logger";
import { startGlobalRecommendationRebuild } from "../../modules/recommendations/recommendation.tasks";
import {
	createTask,
	deleteTask,
	finalizeTask,
	getActiveTasks,
	reserve,
} from "../../modules/taskManager";
import { bookMetadataRepository } from "../books/metadata/metadata.repository";
import { adminRepository } from "./admin.repository";

const log = logger.child({ component: "admin-service" });

const ENRICH_ENQUEUE_BATCH = 5000;

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
 * Recalculates cover colors for every ebook and audiobook, including entries
 * that already have a color from an older extraction algorithm.
 */
export async function backfillCoverColors(): Promise<number> {
	const rows = await adminRepository.coversForColorRecalculation();
	const targets = rows.filter((r) => r.cover != null);
	if (targets.length === 0) return 0;

	const task = await createTask({
		type: "cover-color",
		totalJobs: targets.length,
		sealed: true,
	});
	const jobs = targets.map((row) => ({
		name: "backfill",
		data: {
			bookId: Number(row.bookId),
			coverPath: row.cover as string,
			mediaType: row.mediaType,
			taskId: task.id,
		},
		opts: { removeOnComplete: true, removeOnFail: 100 },
	}));
	try {
		await coverColorQueue.addBulk(jobs);
	} catch (err) {
		await deleteTask(task.id);
		throw err;
	}
	return jobs.length;
}

/**
 * Enqueues a one-off full reindex job (books, series, authors) and creates a visible task entry.
 * No-op when using PGroonga (data is always in sync).
 */
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

/**
 * Force re-enriches every book from Amazon by fanning out one enrich job per
 * book (counted by the progress listener). Returns false when a run is already
 * in progress.
 */
export async function triggerMetadataEnrich(userId?: string): Promise<boolean> {
	const alreadyRunning = (await getActiveTasks()).some(
		(t) => t.type === "metadata-enrich" && t.status === "running",
	);
	if (alreadyRunning) return false;

	if ((await bookMetadataRepository.countAllBooks()) === 0) return false;

	// App-wide (all servers' books); the registry scopes it to app owners.
	const task = await createTask({ type: "metadata-enrich", userId });

	// Fan out in the background so the request returns immediately; reserve
	// before enqueuing each page, then seal once every job is queued.
	void (async () => {
		let lastId: number | null = null;
		try {
			while (true) {
				const books = await bookMetadataRepository.listBookIdsAfter(
					lastId,
					ENRICH_ENQUEUE_BATCH,
				);
				if (books.length === 0) break;
				await reserve(task.id, books.length);
				await metadataEnrichQueue.addBulk(
					books.map((b) => ({
						name: "enrich-book",
						data: { bookId: b.id, uuid: b.uuid, taskId: task.id, force: true },
						opts: {
							removeOnComplete: { age: 60 },
							removeOnFail: { count: 100 },
							priority: 10,
							attempts: 3,
							backoff: { type: "exponential", delay: 60_000 },
						},
					})),
				);
				lastId = books.at(-1)?.id ?? null;
			}
		} catch (err) {
			log.error({ err, taskId: task.id }, "Enrich-all fan-out failed");
		} finally {
			await finalizeTask(task.id).catch(() => {});
		}
	})();

	return true;
}

/**
 * Enqueues enrichment jobs only for books that have metadata but were never
 * successfully enriched from Amazon (amazonEnrichedAt IS NULL).
 */
export async function retryFailedEnrichment(userId?: string): Promise<number> {
	const unenriched = await adminRepository.booksNeverEnriched();

	if (unenriched.length === 0) return 0;

	// App-wide (all servers' books); the registry scopes it to app owners.
	const task = await createTask({
		type: "metadata-enrich-retry",
		totalJobs: unenriched.length,
		sealed: true,
		userId,
	});

	const jobs = unenriched.map((row) => ({
		name: "enrich-book",
		data: {
			bookId: row.bookId,
			uuid: row.uuid,
			taskId: task.id,
		},
		opts: {
			removeOnComplete: { age: 60 as const },
			removeOnFail: { count: 100 as const },
			priority: 10,
			attempts: 3,
			backoff: {
				type: "exponential" as const,
				delay: 60_000,
			},
		},
	}));

	try {
		await metadataEnrichQueue.addBulk(jobs);
	} catch (err) {
		// Don't leave a task that no job will ever update
		await deleteTask(task.id);
		throw err;
	}
	return unenriched.length;
}
