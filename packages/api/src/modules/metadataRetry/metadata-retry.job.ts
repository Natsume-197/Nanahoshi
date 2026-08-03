import { metadataEnrichmentJob } from "../metadataEnrichment/metadata-enrichment.admission";

/**
 * A deferred retry is an ordinary enrich job with a fence: `retryGeneration`
 * lets the worker reject a job whose appointment has since been cancelled or
 * superseded, and the derived `jobId` collapses duplicate dispatches of the
 * same attempt.
 *
 * The queue defaults are deliberately cleared: a retry gets one attempt (the
 * scheduler re-leases it if it fails, so BullMQ's own retry/backoff would
 * double-count), and it keeps the unprioritized FIFO position it has always
 * had rather than joining the priority-10 enrichment band.
 */
export function metadataRetryJob(target: {
	bookId: number;
	uuid: string;
	mediaType: "ebook" | "audiobook";
	providerAttempts: number;
	retryGeneration: number;
}) {
	return metadataEnrichmentJob(
		{
			bookId: target.bookId,
			uuid: target.uuid,
			mediaType: target.mediaType,
			retryGeneration: target.retryGeneration,
		},
		{
			jobId: `metadata-auto-retry-${target.bookId}-${target.retryGeneration}-${target.providerAttempts}`,
			removeOnComplete: true,
			removeOnFail: true,
			attempts: 1,
			priority: undefined,
			backoff: undefined,
		},
	);
}
