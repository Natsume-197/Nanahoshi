import { Queue } from "bullmq";
import { redis } from "../redis";
import { JOB_RETENTION } from "./job-retention";

export const updatesQueue = new Queue("updates", {
	connection: redis,
	defaultJobOptions: { ...JOB_RETENTION },
});

/**
 * The release check runs about once an hour, at a minute picked per process
 * start so instances don't all ask GitHub at once. The tick runs each minute:
 * it starts "Update when idle" installs and automatic downloads.
 */
export async function registerUpdateSchedules() {
	await updatesQueue.setGlobalConcurrency(1);
	const minute = Math.floor(Math.random() * 60);
	await updatesQueue.upsertJobScheduler(
		"update-check",
		{ pattern: `${minute} * * * *`, tz: "UTC" },
		{ name: "check", data: {} },
	);
	await updatesQueue.upsertJobScheduler(
		"update-tick",
		{ every: 60_000 },
		{ name: "tick", data: {} },
	);
	// A first check soon after start, so a restart shows news without waiting.
	await updatesQueue.add(
		"check",
		{},
		{ delay: 60_000, deduplication: { id: "startup-update-check" } },
	);
}
