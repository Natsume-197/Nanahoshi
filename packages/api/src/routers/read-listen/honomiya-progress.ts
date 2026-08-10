export const HONOMIYA_PROGRESS_SCHEMA = "honomiya.progress.v1" as const;

export type HonomiyaProgressEvent = {
	schema: typeof HONOMIYA_PROGRESS_SCHEMA;
	phase: "transcribe";
	sourceIndex: number;
	totalSources: number;
	chunk: number;
	sourceChunks: number;
	totalChunks: number;
	completedChunks: number;
	state: "cached" | "starting" | "resuming" | "retrying" | "completed";
	attempt?: number;
};

export type HonomiyaOperationProgress = {
	phase: "preparing" | "transcribing" | "aligning" | "importing";
	percent: number;
	completed?: number;
	total?: number;
};

const STATES = new Set<HonomiyaProgressEvent["state"]>([
	"cached",
	"starting",
	"resuming",
	"retrying",
	"completed",
]);

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
	return isNonNegativeInteger(value) && value > 0;
}

/** Parse only the versioned progress protocol. Human diagnostics and malformed
 * lines remain ordinary stderr and can still be shown when the CLI fails. */
export function parseHonomiyaProgressLine(
	line: string,
): HonomiyaProgressEvent | null {
	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch {
		return null;
	}
	if (!value || typeof value !== "object") return null;
	const event = value as Record<string, unknown>;
	if (
		event.schema !== HONOMIYA_PROGRESS_SCHEMA ||
		event.phase !== "transcribe" ||
		!isNonNegativeInteger(event.sourceIndex) ||
		!isPositiveInteger(event.totalSources) ||
		event.sourceIndex >= event.totalSources ||
		!isPositiveInteger(event.chunk) ||
		!isPositiveInteger(event.sourceChunks) ||
		!isPositiveInteger(event.totalChunks) ||
		event.chunk > event.sourceChunks ||
		!isNonNegativeInteger(event.completedChunks) ||
		event.completedChunks > event.totalChunks ||
		typeof event.state !== "string" ||
		!STATES.has(event.state as HonomiyaProgressEvent["state"])
	) {
		return null;
	}
	if (event.attempt !== undefined && !isPositiveInteger(event.attempt)) {
		return null;
	}
	return event as HonomiyaProgressEvent;
}

/** Transcription occupies 5–85% of the full Nanahoshi operation. Honomiya
 * preplans every source, so every completed chunk has equal weight. */
export function operationProgressFromHonomiya(
	event: HonomiyaProgressEvent,
): HonomiyaOperationProgress {
	const totalFraction = event.completedChunks / event.totalChunks;
	const transcriptionComplete = totalFraction >= 1;
	return {
		phase: transcriptionComplete ? "aligning" : "transcribing",
		percent: transcriptionComplete ? 85 : Math.round(5 + totalFraction * 80),
		completed: event.completedChunks,
		total: event.totalChunks,
	};
}
