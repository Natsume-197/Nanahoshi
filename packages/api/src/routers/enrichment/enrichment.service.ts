import { BadRequestError, NotFoundError } from "../../errors";
import { providerGate } from "../../infrastructure/providerGate";
import { providerQuotaScope } from "../../infrastructure/providerQuotaScope";
import { resolveLifecycle } from "../../modules/metadataEnrichment/enrichment-lifecycle";
import { enqueueMetadataEnrichmentBulk } from "../../modules/metadataEnrichment/metadata-enrichment.admission";
import { metadataRetryProjection } from "../../modules/metadataRetry/metadata-retry.projection";
import { audiobookMetadataService } from "../audiobooks/metadata/metadata.service";
import {
	AUDIOBOOK_PROVIDER_IDS,
	AUDIOBOOK_PROVIDER_MANIFEST,
} from "../audiobooks/metadata/providers/provider.manifest";
import { bookMetadataService } from "../books/metadata/metadata.service";
import {
	BOOK_PROVIDER_IDS,
	BOOK_PROVIDER_MANIFEST,
} from "../books/metadata/providers/provider.manifest";
import {
	type MetadataProvidersConfig,
	removeProvidersFromConfig,
} from "../libraries/library.model";
import { libraryRepository } from "../libraries/library.repository";
import type {
	ListEnrichmentFilters,
	TargetSelectionInput,
} from "./enrichment.model";
import { enrichmentStateRepository } from "./enrichment.repository";

// Every known provider, both media types, for labels + gate status in the UI.
const ALL_PROVIDER_MANIFESTS = [
	...Object.entries(BOOK_PROVIDER_MANIFEST),
	...Object.entries(AUDIOBOOK_PROVIDER_MANIFEST),
];

const ALL_PROVIDER_LABELS: Record<string, string> = Object.fromEntries(
	ALL_PROVIDER_MANIFESTS.map(([id, manifest]) => [id, manifest.label]),
);

// `{id}` templates rather than finished URLs: the providerId is per row, and
// providers whose page depends on library config have no template at all.
const ALL_PROVIDER_URL_TEMPLATES: Record<string, string> = Object.fromEntries(
	ALL_PROVIDER_MANIFESTS.flatMap(([id, manifest]) =>
		manifest.recordUrlTemplate ? [[id, manifest.recordUrlTemplate]] : [],
	),
);

export class EnrichmentService {
	async list(serverId: string, filters: ListEnrichmentFilters) {
		const [result, counts, lifecycleCounts] = await Promise.all([
			enrichmentStateRepository.list(serverId, filters),
			enrichmentStateRepository.countsByBucket(serverId, {
				libraryUuid: filters.libraryUuid,
				mediaType: filters.mediaType,
				withFailures: filters.withFailures,
			}),
			// Every lifecycle at once, ignoring both the bucket and the lifecycle
			// filter: the sidebar shows all of them side by side, and a lifecycle
			// belongs to exactly one bucket, so a bucket-scoped count would be the
			// same number for the rows it covers and zero for the rest.
			enrichmentStateRepository.countsByLifecycle(serverId, {
				libraryUuid: filters.libraryUuid,
				mediaType: filters.mediaType,
				withFailures: filters.withFailures,
			}),
		]);
		return {
			...result,
			items: result.items.map((item) => ({
				...item,
				lifecycle: resolveLifecycle({
					status: item.status,
					nextRetryAt: item.nextRetryAt,
					providerAttempts: item.providerAttempts,
					hasFailures: item.failures.length > 0,
					decision: item.decision,
				}),
				retry: metadataRetryProjection({
					nextRetryAt: item.nextRetryAt,
					providerAttempts: item.providerAttempts,
					hasFailures: item.failures.length > 0,
				}),
			})),
			counts,
			lifecycleCounts,
			providerLabels: ALL_PROVIDER_LABELS,
			providerUrlTemplates: ALL_PROVIDER_URL_TEMPLATES,
		};
	}

	// Eligibility per action for a "select all results" bulk selection.
	async actionableCounts(
		serverId: string,
		filter: { bucket?: string; libraryUuid?: string; query?: string },
	) {
		return enrichmentStateRepository.actionableCounts(
			serverId,
			filter as Parameters<
				typeof enrichmentStateRepository.actionableCounts
			>[1],
		);
	}

	async detail(serverId: string, bookUuid: string) {
		const detail = await enrichmentStateRepository.detail(serverId, bookUuid);
		if (!detail) return null;
		return {
			...detail,
			retry: metadataRetryProjection({
				nextRetryAt: detail.nextRetryAt,
				providerAttempts: detail.providerAttempts,
				hasFailures: (detail.failures?.length ?? 0) > 0,
			}),
			providerLabels: ALL_PROVIDER_LABELS,
			providerUrlTemplates: ALL_PROVIDER_URL_TEMPLATES,
		};
	}

	// Providers with an open breaker, for the "amazon en cooldown hasta…" strip.
	async providerStatus(serverId: string, libraryUuid?: string) {
		const selectedLibrary = libraryUuid
			? await libraryRepository.findByUuid(libraryUuid, serverId)
			: null;
		const quotaContext = {
			serverId,
			amazonDomain: selectedLibrary?.metadataConfig?.amazon?.domain,
			region: selectedLibrary?.metadataConfig?.audible?.region,
		};
		const providerScopes = Object.fromEntries(
			Object.keys(ALL_PROVIDER_LABELS).map((provider) => [
				provider,
				providerQuotaScope(provider, quotaContext),
			]),
		);
		const [cooldowns, failures, failingBooks] = await Promise.all([
			providerGate.scopedCooldowns(providerScopes),
			enrichmentStateRepository.providerFailureSummary(serverId, libraryUuid),
			enrichmentStateRepository.failingBookCount(serverId, libraryUuid),
		]);
		return {
			labels: ALL_PROVIDER_LABELS,
			cooldowns,
			failures,
			failingBooks,
		};
	}

	// One-shot fix for systemic provider failures: disable ALL the chosen failing
	// providers for the library (durable — survives the next scan) and reprocess
	// the affected books ONCE. Editing the config is the real root-cause fix; a
	// per-provider auto-reprocess would re-run everything N times while the other
	// broken providers still drag the books down.
	async resolveProviderFailures(
		serverId: string,
		input: { libraryUuid: string; providers: string[] },
	) {
		const library = await libraryRepository.findByUuid(
			input.libraryUuid,
			serverId,
		);
		if (!library) throw new NotFoundError("Library not found");

		// The client may be stale (or bypassed entirely). Re-check eligibility at
		// mutation time so a temporary cooldown can never remove a provider from
		// the durable library configuration.
		const failures = await enrichmentStateRepository.providerFailureSummary(
			serverId,
			input.libraryUuid,
		);
		const nonActionable = input.providers.filter(
			(provider) => failures[provider] === undefined,
		);
		if (nonActionable.length > 0) {
			throw new BadRequestError(
				"Only providers with persistent failures can be disabled",
			);
		}

		const defaultOrder =
			library.mediaType === "audiobook"
				? AUDIOBOOK_PROVIDER_IDS
				: BOOK_PROVIDER_IDS;
		const result = removeProvidersFromConfig(
			library.metadataProviders,
			input.providers,
			defaultOrder,
		);
		if (!result) {
			throw new BadRequestError(
				"Cannot disable every provider for this library",
			);
		}
		if (result.changed) {
			await libraryRepository.update(
				library.id,
				{ metadataProviders: result.config as MetadataProvidersConfig },
				serverId,
			);
		}

		// A single reprocess over every book in the library that
		// still carries a failure, so they settle without the disabled providers.
		const { enqueued } = await this.retry(serverId, {
			filter: { libraryUuid: input.libraryUuid, withFailures: true },
		});
		return { disabled: result.changed, reprocessed: enqueued };
	}

	// Reopen the selected books and enqueue their enrichment jobs. addBulk is a
	// single Redis pipeline, so a few thousand retries stay cheap; the resolver
	// caps the filter path at 10k per call. Manual retry ignores library pause.
	async retry(
		serverId: string,
		input: {
			bookUuids?: string[];
			filter?: {
				bucket?: string;
				libraryUuid?: string;
				mediaType?: "ebook" | "audiobook";
				withFailures?: boolean;
				query?: string;
			};
			refresh?: boolean;
		},
	) {
		const targets = await enrichmentStateRepository.resolveTargets(
			serverId,
			input as TargetSelectionInput,
		);
		if (targets.length === 0) return { enqueued: 0 };

		await enrichmentStateRepository.resetForRetry(
			targets.map(({ bookId }) => bookId),
		);
		try {
			await enqueueMetadataEnrichmentBulk(
				targets.map(({ bookId, uuid, mediaType }) => ({
					bookId,
					uuid,
					mediaType,
					force: true,
					refresh: input.refresh ?? false,
				})),
			);
		} catch (error) {
			// Redis is the executor, not the source of truth. Preserve the manual
			// retry intent so the durable dispatcher can recover it.
			await enrichmentStateRepository.deferRetryAdmission(
				targets.map(({ bookId }) => bookId),
				new Date(Date.now() + 60_000),
			);
			throw error;
		}
		return { enqueued: targets.length };
	}

	// Cancel only the scheduled automatic retry (the "cancel retry" row action).
	async cancelRetry(serverId: string, input: TargetSelectionInput) {
		const targets = await enrichmentStateRepository.resolveTargets(
			serverId,
			input,
		);
		const cancelled = await enrichmentStateRepository.cancelRetries(
			targets.map(({ bookId }) => bookId),
		);
		return { cancelled };
	}

	async restoreOriginal(serverId: string, input: TargetSelectionInput) {
		const targets = await enrichmentStateRepository.resolveTargets(
			serverId,
			input,
		);
		const results = await Promise.all(
			targets.map((target) =>
				target.mediaType === "audiobook"
					? audiobookMetadataService.restoreOriginal(target.bookId)
					: bookMetadataService.restoreOriginal(target.bookId),
			),
		);
		return {
			restored: results.filter(Boolean).length,
			matched: targets.length,
		};
	}

	// Human sign-off on weak (title-only) matches: review → enriched.
	async approve(serverId: string, input: TargetSelectionInput) {
		const targets = await enrichmentStateRepository.resolveTargets(
			serverId,
			input,
		);
		await enrichmentStateRepository.approve(
			targets.map(({ bookId }) => bookId),
		);
		return { approved: targets.length };
	}
}

export const enrichmentService = new EnrichmentService();
