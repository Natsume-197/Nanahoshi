import { providerGate } from "../../infrastructure/providerGate";
import { metadataEnrichQueue } from "../../infrastructure/queue/queues/metadata-enrich.queue";
import { AUDIOBOOK_PROVIDER_MANIFEST } from "../audiobooks/metadata/providers/provider.manifest";
import { BOOK_PROVIDER_MANIFEST } from "../books/metadata/providers/provider.manifest";
import type { ListEnrichmentFilters } from "./enrichment.model";
import { enrichmentStateRepository } from "./enrichment.repository";

// Every known provider, both media types, for labels + gate status in the UI.
const ALL_PROVIDER_LABELS: Record<string, string> = Object.fromEntries(
	[
		...Object.entries(BOOK_PROVIDER_MANIFEST),
		...Object.entries(AUDIOBOOK_PROVIDER_MANIFEST),
	].map(([id, manifest]) => [id, manifest.label]),
);

export class EnrichmentService {
	async list(serverId: string, filters: ListEnrichmentFilters) {
		const [result, counts] = await Promise.all([
			enrichmentStateRepository.list(serverId, filters),
			enrichmentStateRepository.countsByStatus(serverId, filters.libraryUuid),
		]);
		return { ...result, counts };
	}

	async detail(serverId: string, bookUuid: string) {
		const detail = await enrichmentStateRepository.detail(serverId, bookUuid);
		if (!detail) return null;
		return { ...detail, providerLabels: ALL_PROVIDER_LABELS };
	}

	// Providers with an open breaker, for the "amazon en cooldown hasta…" strip.
	async providerStatus() {
		const cooldowns = await providerGate.cooldowns(
			Object.keys(ALL_PROVIDER_LABELS),
		);
		return {
			labels: ALL_PROVIDER_LABELS,
			cooldowns,
		};
	}

	// Reopen the selected books and enqueue their enrichment jobs. addBulk is a
	// single Redis pipeline, so a few thousand retries stay cheap; the resolver
	// caps the filter path at 10k per call.
	async retry(
		serverId: string,
		input: {
			bookUuids?: string[];
			filter?: {
				status?: "pending" | "enriched" | "partial" | "no_match" | "review";
				libraryUuid?: string;
			};
			refresh?: boolean;
		},
	) {
		const targets = await enrichmentStateRepository.resolveRetryTargets(
			serverId,
			input,
		);
		if (targets.length === 0) return { enqueued: 0 };

		await enrichmentStateRepository.resetForRetry(
			targets.map(({ bookId }) => bookId),
		);
		await metadataEnrichQueue.addBulk(
			targets.map(({ bookId, uuid, mediaType }) => ({
				name: mediaType === "audiobook" ? "enrich-audiobook" : "enrich-book",
				data: {
					bookId,
					uuid,
					force: true,
					refresh: input.refresh ?? false,
				},
				opts: {
					removeOnComplete: { age: 60 },
					removeOnFail: { count: 100 },
					attempts: 3,
					backoff: { type: "exponential", delay: 60_000 },
				},
			})),
		);
		return { enqueued: targets.length };
	}

	// Human sign-off on weak (title-only) matches: review → enriched.
	async approve(serverId: string, bookUuids: string[]) {
		const targets = await enrichmentStateRepository.resolveRetryTargets(
			serverId,
			{ bookUuids },
		);
		await enrichmentStateRepository.approve(
			targets.map(({ bookId }) => bookId),
		);
		return { approved: targets.length };
	}
}

export const enrichmentService = new EnrichmentService();
