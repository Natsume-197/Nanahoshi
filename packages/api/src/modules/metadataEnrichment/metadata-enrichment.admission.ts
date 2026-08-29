import type { EnrichmentStatus } from "@nanahoshi-v2/db/schema/general";
import type { JobsOptions } from "bullmq";
import { metadataEnrichQueue } from "../../infrastructure/queue/queues/metadata-enrich.queue";

// Terminal = the automatic pipeline is done with this book, either because it
// matched or because it ran out of options. Non-terminal rows (and books with
// no row at all) are picked up again by scans and reprocesses.
export const TERMINAL_STATUSES: readonly EnrichmentStatus[] = [
	"enriched",
	"no_match",
	"review",
];

export function isTerminalStatus(status: EnrichmentStatus | null): boolean {
	return status != null && TERMINAL_STATUSES.includes(status);
}

/**
 * Who asked. `automatic` is the pipeline running on its own (scan, promote,
 * ungroup, deferred retry) and obeys every rule. `explicit` is a human acting
 * on these exact books (manual retry, library refresh, admin reprocess): it
 * overrides library pause and terminal status, because refusing a
 * direct request silently is worse than doing the work.
 */
export type EnrichmentTrigger = "automatic" | "explicit";

/** Everything Enrichment Admission needs, read in one go. */
export type AdmissionFacts = {
	duplicateOfBookId: number | null;
	libraryPausedAt: string | null;
	/** null when the book has no enrichment_state row yet. */
	status: EnrichmentStatus | null;
	nextRetryAt: string | null;
	retryGeneration: number;
};

export type AdmissionDenial =
	| "hidden_copy"
	| "library_paused"
	| "terminal"
	| "stale_generation";

export type Admission = { ok: true } | { ok: false; reason: AdmissionDenial };

const ADMITTED: Admission = { ok: true };
const deny = (reason: AdmissionDenial): Admission => ({ ok: false, reason });

/**
 * May this book enter the Catalog Enrichment Pipeline right now?
 *
 * Authoritative at dequeue time, not at enqueue time: a library can be paused,
 * a retry cancelled while the job waits in Redis, so only
 * the worker sees the state that actually decides. Enqueue-side checks are a
 * best-effort filter to avoid queueing work that will be thrown away.
 *
 * `retryGeneration` is carried by deferred-retry jobs and fences the ones that
 * were already leased when the user cancelled a retry.
 */
export function admit(
	facts: AdmissionFacts,
	{
		trigger,
		retryGeneration,
	}: { trigger: EnrichmentTrigger; retryGeneration?: number },
): Admission {
	// Hidden copies are never enriched, whoever asks: only the canonical record
	// is shown, so enriching a copy would waste provider calls and let metadata
	// diverge inside one Consistent Edition Group.
	if (facts.duplicateOfBookId != null) return deny("hidden_copy");
	if (trigger === "explicit") return ADMITTED;

	if (facts.libraryPausedAt != null) return deny("library_paused");
	if (isTerminalStatus(facts.status)) return deny("terminal");

	// A retry job is only valid for the appointment that created it.
	if (retryGeneration != null) {
		const current =
			facts.retryGeneration === retryGeneration && facts.nextRetryAt != null;
		return current ? ADMITTED : deny("stale_generation");
	}
	return ADMITTED;
}

export type MetadataEnrichmentTarget = {
	bookId: number;
	uuid: string;
	mediaType?: "ebook" | "audiobook";
	taskId?: string;
	force?: boolean;
	refresh?: boolean;
	/** Set by deferred retries; fences the job against its appointment. */
	retryGeneration?: number;
};

const DEFAULT_JOB_OPTIONS = {
	removeOnComplete: { age: 60 },
	removeOnFail: { count: 100 },
	priority: 10,
	attempts: 3,
	backoff: { type: "exponential", delay: 60_000 },
} as const satisfies JobsOptions;

export function metadataEnrichmentJob(
	target: MetadataEnrichmentTarget,
	options: JobsOptions = {},
) {
	const { mediaType = "ebook", ...data } = target;
	return {
		name: mediaType === "audiobook" ? "enrich-audiobook" : "enrich-book",
		data,
		opts: { ...DEFAULT_JOB_OPTIONS, ...options },
	};
}

export async function enqueueMetadataEnrichment(
	target: MetadataEnrichmentTarget,
	options?: JobsOptions,
): Promise<void> {
	const job = metadataEnrichmentJob(target, options);
	await metadataEnrichQueue.add(job.name, job.data, job.opts);
}

export async function enqueueMetadataEnrichmentBulk(
	targets: readonly MetadataEnrichmentTarget[],
	options?: JobsOptions,
): Promise<void> {
	if (targets.length === 0) return;
	await metadataEnrichQueue.addBulk(
		targets.map((target) => metadataEnrichmentJob(target, options)),
	);
}
