import { env } from "@nanahoshi-v2/env/server";
import { ensureDefaultRole } from "../../auth/access.repository";
import { bookIndexQueue } from "../../infrastructure/queue/queues/book-index.queue";
import { coverColorQueue } from "../../infrastructure/queue/queues/cover-color.queue";
import { metadataEnrichQueue } from "../../infrastructure/queue/queues/metadata-enrich.queue";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import { logger } from "../../lib/logger";
import { createTask, deleteTask } from "../../modules/taskManager";
import { adminRepository } from "./admin.repository";

const log = logger.child({ component: "admin-service" });

export async function getSystemStats() {
	const counts = await adminRepository.getSystemCounts();
	return {
		...counts,
		searchProvider: env.SEARCH_PROVIDER as "elasticsearch" | "pgroonga",
	};
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

export async function listOrganizations() {
	return adminRepository.listOrganizations();
}

export async function createOrganization(
	name: string,
	slug: string,
	creatorId: string,
) {
	const id = crypto.randomUUID();

	await adminRepository.createOrganization(id, name, slug, creatorId);

	// Seed the @everyone role so non-owner members get baseline permissions.
	await ensureDefaultRole(id);

	return { id, name, slug };
}

export async function deleteOrganization(orgId: string) {
	await adminRepository.deleteOrganization(orgId);
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
 * Enqueues cover-color extraction jobs for all books that have a cover
 * but no mainColor yet. Returns the number of jobs enqueued.
 */
export async function backfillCoverColors(): Promise<number> {
	const rows = await adminRepository.booksNeedingCoverColor();

	if (rows.length === 0) return 0;

	// The query filters on isNotNull(cover), but TS can't see that
	const jobs = rows.flatMap((row) =>
		row.cover
			? [
					{
						name: "backfill",
						data: {
							bookId: Number(row.bookId),
							coverPath: row.cover,
						},
						opts: { removeOnComplete: true, removeOnFail: 100 },
					},
				]
			: [],
	);
	await coverColorQueue.addBulk(jobs);

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
	const task = await createTask({
		type: "book-reindex",
		label: "Reindex search",
		totalJobs: 1,
		sealed: true,
		queue: "book-index",
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
 * Enqueues a job to enrich metadata from Amazon for all books.
 * Creates a visible task entry with per-book progress tracking.
 * Returns false when a run is already queued or in progress.
 */
export async function triggerMetadataEnrich(): Promise<boolean> {
	// Only one enrich-all at a time: a leftover finished/failed singleton is
	// cleaned up so it doesn't block future runs; a live one means the run is
	// already pending and no new task should be created.
	const existing = await metadataEnrichQueue.getJob(
		"metadata-enrich-singleton",
	);
	if (existing) {
		const state = await existing.getState();
		if (state === "completed" || state === "failed" || state === "unknown") {
			await existing.remove().catch(() => {});
		} else {
			return false;
		}
	}

	const task = await createTask({
		type: "metadata-enrich",
		label: "Enrich metadata from Amazon",
		queue: "metadata-enrich",
	});
	try {
		await metadataEnrichQueue.add(
			"enrich-all",
			{ taskId: task.id },
			{
				jobId: "metadata-enrich-singleton",
				removeOnComplete: true,
				removeOnFail: true,
			},
		);
	} catch (err) {
		// Don't leave a task that no job will ever update
		await deleteTask(task.id);
		throw err;
	}
	return true;
}

/**
 * Enqueues enrichment jobs only for books that have metadata but were never
 * successfully enriched from Amazon (amazonEnrichedAt IS NULL).
 */
export async function retryFailedEnrichment(): Promise<number> {
	const unenriched = await adminRepository.booksNeverEnriched();

	if (unenriched.length === 0) return 0;

	const task = await createTask({
		type: "metadata-enrich-retry",
		label: "Retry failed Amazon enrichment",
		totalJobs: unenriched.length,
		sealed: true,
		queue: "metadata-enrich",
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
