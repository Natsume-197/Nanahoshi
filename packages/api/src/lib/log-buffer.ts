import { randomUUID } from "node:crypto";
import type { DestinationStream } from "pino";

export const LOG_LEVELS = [
	"trace",
	"debug",
	"info",
	"warn",
	"error",
	"fatal",
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogSource = "server" | "worker";

export interface LogEntry {
	id: string;
	timestamp: string;
	level: LogLevel;
	source: LogSource;
	message: string;
	context: Record<string, unknown>;
}

const LEVEL_NAMES: Record<number, LogLevel> = {
	10: "trace",
	20: "debug",
	30: "info",
	40: "warn",
	50: "error",
	60: "fatal",
};

const PINO_FIELDS = new Set(["level", "time", "pid", "hostname", "msg"]);
const MAX_LINE_LENGTH = 64 * 1024;
export const DEFAULT_LOG_CAPACITY = 1000;
export const CURRENT_LOG_SOURCE: LogSource =
	process.env.PROCESS_ROLE === "worker" ? "worker" : "server";
const PROCESS_LOG_ID = randomUUID();
const REDACTED_VALUE = "[Redacted]";
const SENSITIVE_KEY =
	/^(?:password|newpassword|currentpassword|token|accesstoken|refreshtoken|apikey|secret|sig|cookie|authorization)$/i;

function sanitizeValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sanitizeValue);
	if (!value || typeof value !== "object") return value;

	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
			key,
			SENSITIVE_KEY.test(key) ? REDACTED_VALUE : sanitizeValue(nested),
		]),
	);
}

export class LogBuffer {
	private entries: LogEntry[] = [];
	private nextId = 1;
	private listeners = new Set<(entry: LogEntry) => void>();

	constructor(
		private readonly capacity = DEFAULT_LOG_CAPACITY,
		private readonly source = CURRENT_LOG_SOURCE,
	) {}

	write(line: string): void {
		for (const record of line.split("\n")) {
			if (!record.trim()) continue;
			this.ingest(record);
		}
	}

	list(): LogEntry[] {
		return this.entries.slice().reverse();
	}

	subscribe(listener: (entry: LogEntry) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private ingest(line: string): void {
		if (line.length > MAX_LINE_LENGTH) return;

		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch {
			return;
		}
		if (!value || typeof value !== "object" || Array.isArray(value)) return;

		const record = value as Record<string, unknown>;
		const level =
			typeof record.level === "number" ? LEVEL_NAMES[record.level] : undefined;
		if (!level) return;

		const context = sanitizeValue(
			Object.fromEntries(
				Object.entries(record).filter(([key]) => !PINO_FIELDS.has(key)),
			),
		) as Record<string, unknown>;
		const entry: LogEntry = {
			id: `${this.source}:${PROCESS_LOG_ID}:${this.nextId++}`,
			timestamp:
				typeof record.time === "string"
					? record.time
					: new Date().toISOString(),
			level,
			source: this.source,
			message: typeof record.msg === "string" ? record.msg : "",
			context,
		};
		this.entries.push(entry);

		if (this.entries.length > this.capacity) {
			this.entries.splice(0, this.entries.length - this.capacity);
		}
		for (const listener of this.listeners) listener(entry);
	}
}

export const logBuffer = new LogBuffer();

export const logBufferDestination: DestinationStream = {
	write(chunk) {
		logBuffer.write(chunk);
	},
};
