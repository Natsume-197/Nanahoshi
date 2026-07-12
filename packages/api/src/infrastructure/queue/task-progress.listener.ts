import { Job, type Queue, QueueEvents } from "bullmq";
import { logger } from "../../lib/logger";
import {
	bumpCompleted,
	bumpFailed,
	reconcileActiveTasks,
} from "../../modules/taskManager";
import type { QueueName } from "../../modules/tasks/task-registry";
import { bookIndexQueue } from "./queues/book-index.queue";
import { coverColorQueue } from "./queues/cover-color.queue";
import { fileEventQueue } from "./queues/file-event.queue";
import { metadataEnrichQueue } from "./queues/metadata-enrich.queue";
import { ranobedbImportQueue } from "./queues/ranobedb-import.queue";
import { recommendationsQueue } from "./queues/recommendations.queue";
import { sendToKindleQueue } from "./queues/send-to-kindle.queue";
import { redis } from "./redis";

const log = logger.child({ component: "task-progress-listener" });

// Inline orchestrators that count their own progress; counting their job-level
// completion again would add a phantom +1.
const SELF_COUNTED_JOBS = new Set(["import"]);

const RECONCILE_INTERVAL_MS = 60_000;
const DRAINED_DEBOUNCE_MS = 2_000;
const LAST_ID_KEY = (queue: QueueName) => `task:qe:lastid:${queue}`;

// Queues whose jobs belong to tasks. search-sync is absent on purpose — its
// jobs carry no taskId and aren't user-facing progress.
const TRACKED_QUEUES: { name: QueueName; queue: Queue }[] = [
	{ name: "file-events", queue: fileEventQueue },
	{ name: "metadata-enrich", queue: metadataEnrichQueue },
	{ name: "book-index", queue: bookIndexQueue },
	{ name: "send-to-kindle", queue: sendToKindleQueue },
	{ name: "ranobedb-import", queue: ranobedbImportQueue },
	{ name: "cover-color", queue: coverColorQueue },
	{ name: "recommendations", queue: recommendationsQueue },
];

function readTaskId(returnvalue: unknown): string | undefined {
	// QueueEvents already JSON-parses `completed` return values, but stay
	// defensive in case a raw string slips through.
	let value = returnvalue;
	if (typeof value === "string") {
		try {
			value = JSON.parse(value);
		} catch {
			return undefined;
		}
	}
	const taskId = (value as { taskId?: unknown } | null)?.taskId;
	return typeof taskId === "string" ? taskId : undefined;
}

/**
 * Counts task progress off BullMQ's durable event stream (one QueueEvents per
 * task-bearing queue) rather than in-process handlers. Idempotent, so a resumed
 * stream after a restart never double-counts.
 */
export async function startTaskProgressListeners(): Promise<{
	close: () => Promise<void>;
}> {
	const lastIds = new Map<QueueName, string>();
	const queueEvents: QueueEvents[] = [];
	let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

	const scheduleReconcile = () => {
		if (reconcileTimer) return;
		reconcileTimer = setTimeout(() => {
			reconcileTimer = null;
			reconcileActiveTasks().catch((err) =>
				log.error({ err }, "reconcileActiveTasks failed"),
			);
		}, DRAINED_DEBOUNCE_MS);
	};

	const flushLastIds = async () => {
		await Promise.all(
			[...lastIds.entries()].map(([name, id]) =>
				redis.set(LAST_ID_KEY(name), id).catch(() => {}),
			),
		);
	};

	for (const { name, queue } of TRACKED_QUEUES) {
		// Resume from where we left off so completions during downtime aren't lost;
		// "$" (BullMQ default) on first boot avoids replaying the whole stream.
		const lastEventId = (await redis.get(LAST_ID_KEY(name))) ?? undefined;
		const qe = new QueueEvents(name, {
			connection: redis.options,
			lastEventId,
		});

		qe.on("completed", ({ jobId, returnvalue }, id) => {
			lastIds.set(name, id);
			const taskId = readTaskId(returnvalue);
			if (!taskId) return; // untracked job, or a self-counting orchestrator
			bumpCompleted(taskId, jobId).catch((err) =>
				log.error({ err, jobId, queue: name }, "bumpCompleted failed"),
			);
		});

		qe.on("failed", async ({ jobId }, id) => {
			lastIds.set(name, id);
			try {
				const job = await Job.fromId(queue, jobId);
				if (!job) return;
				const taskId = job.data?.taskId as string | undefined;
				if (!taskId || SELF_COUNTED_JOBS.has(job.name)) return;
				// `failed` fires on every attempt; only the terminal failure counts.
				const maxAttempts = job.opts.attempts || 1;
				if (job.attemptsMade < maxAttempts) return;
				await bumpFailed(taskId, jobId);
			} catch (err) {
				log.error({ err, jobId, queue: name }, "failed handler error");
			}
		});

		qe.on("drained", (id) => {
			lastIds.set(name, id);
			scheduleReconcile();
		});

		qe.on("error", (err) =>
			log.error({ err, queue: name }, "QueueEvents error"),
		);

		queueEvents.push(qe);
	}

	// Periodic backstop: finish sealed tasks whose finish event was lost.
	const interval = setInterval(() => {
		reconcileActiveTasks().catch(() => {});
		flushLastIds().catch(() => {});
	}, RECONCILE_INTERVAL_MS);

	log.info(
		{ queues: TRACKED_QUEUES.map((q) => q.name) },
		"Task progress listeners started",
	);

	return {
		close: async () => {
			clearInterval(interval);
			if (reconcileTimer) clearTimeout(reconcileTimer);
			await flushLastIds();
			await Promise.all(queueEvents.map((qe) => qe.close()));
		},
	};
}
