import { redis } from "../infrastructure/queue/redis";
import {
	DEFAULT_LOG_CAPACITY,
	LOG_LEVELS,
	type LogEntry,
	logBuffer,
} from "./log-buffer";

const REDIS_LOG_KEY = "nanahoshi-v2:logs:v1";
const FLUSH_DELAY_MS = 100;

const pending: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;
let flushChain = Promise.resolve();

function scheduleFlush(): void {
	if (flushTimer) return;
	flushTimer = setTimeout(() => {
		flushTimer = null;
		void flushSharedLogHistory();
	}, FLUSH_DELAY_MS);
	flushTimer.unref();
}

async function flushBatch(): Promise<void> {
	const batch = pending.splice(0);
	if (batch.length === 0) return;

	const pipeline = redis.pipeline();
	for (const entry of batch)
		pipeline.lpush(REDIS_LOG_KEY, JSON.stringify(entry));
	pipeline.ltrim(REDIS_LOG_KEY, 0, DEFAULT_LOG_CAPACITY - 1);
	await pipeline.exec();
}

export function startSharedLogHistory(): void {
	if (unsubscribe) return;
	unsubscribe = logBuffer.subscribe((entry) => {
		pending.push(entry);
		scheduleFlush();
	});
	// Capture startup events emitted before Redis-backed history was initialized.
	pending.push(...logBuffer.list().reverse());
	scheduleFlush();
}

export function flushSharedLogHistory(): Promise<void> {
	flushChain = flushChain.then(flushBatch, flushBatch);
	return flushChain;
}

export async function stopSharedLogHistory(): Promise<void> {
	unsubscribe?.();
	unsubscribe = null;
	if (flushTimer) clearTimeout(flushTimer);
	flushTimer = null;
	await flushSharedLogHistory();
}

function isLogEntry(value: unknown): value is LogEntry {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const entry = value as Partial<LogEntry>;
	return (
		typeof entry.id === "string" &&
		typeof entry.timestamp === "string" &&
		typeof entry.level === "string" &&
		LOG_LEVELS.includes(entry.level as (typeof LOG_LEVELS)[number]) &&
		(entry.source === "server" || entry.source === "worker") &&
		typeof entry.message === "string" &&
		!!entry.context &&
		typeof entry.context === "object" &&
		!Array.isArray(entry.context)
	);
}

export async function listSharedLogs(): Promise<LogEntry[]> {
	try {
		await flushSharedLogHistory();
		const records = await redis.lrange(
			REDIS_LOG_KEY,
			0,
			DEFAULT_LOG_CAPACITY - 1,
		);
		return records.flatMap((record) => {
			try {
				const entry: unknown = JSON.parse(record);
				return isLogEntry(entry) ? [entry] : [];
			} catch {
				return [];
			}
		});
	} catch {
		return logBuffer.list();
	}
}
