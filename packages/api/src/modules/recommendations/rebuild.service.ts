import type { Job } from "bullmq";
import { logger } from "../../lib/logger";
import { settingsRepository } from "../../routers/settings/settings.repository";
import { isRecommendationsEnabled } from "../../routers/settings/settings.service";
import {
	buildEmbeddingSpace,
	type EmbeddingSpace,
	embeddingCosOf,
	generateSimilarities,
} from "./candidate-generation";
import {
	EMBEDDING_MODEL,
	embedBatch,
	hashEmbeddingInput,
	resolveCapability,
} from "./embedder";
import { computePopularity } from "./popularity";
import { recommendationComputeRepository as repo } from "./recommendation-compute.repository";
import { buildIdf, WEIGHTS_VERSION } from "./scorer";
import type { ScoredPair, WorkAggregate, WorkKey } from "./types";
import { workKey } from "./types";

const log = logger.child({ component: "recommendations-rebuild" });

const EMBED_COMMIT_BATCH = 64;
const HASH_CONCURRENCY = 512;
const FEED_CONCURRENCY = 2;
const CATALOG_FP_KEY = "recommendations.fp.catalog";
const ENGAGEMENT_FP_KEY = "recommendations.fp.engagement";

async function hashFingerprint(input: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(input),
	);
	return Buffer.from(digest).toString("hex").slice(0, 32);
}

async function embedChangedWorks(
	serverId: string,
	works: WorkAggregate[],
	job?: Job,
): Promise<boolean> {
	const capability = await resolveCapability();
	if (!capability.enabled) return false;

	const existing = await repo.loadEmbeddingHashes(serverId);
	const pending: { work: WorkAggregate; hash: string }[] = [];
	// Hashing every work decides what to re-embed and runs on every rebuild even
	// when nothing changed; awaiting one SHA-256 at a time serializes thousands of
	// threadpool round-trips. Hash in bounded parallel chunks instead.
	for (let i = 0; i < works.length; i += HASH_CONCURRENCY) {
		const chunk = works.slice(i, i + HASH_CONCURRENCY);
		const hashes = await Promise.all(
			chunk.map((w) => hashEmbeddingInput(w.embeddingText)),
		);
		for (let j = 0; j < chunk.length; j++) {
			const w = chunk[j];
			const hash = hashes[j];
			if (!w || hash === undefined) continue;
			if (existing.get(workKey(w.kind, w.id)) !== hash)
				pending.push({ work: w, hash });
		}
	}

	// committed per batch: a long first run is resumable and stoppable
	for (let i = 0; i < pending.length; i += EMBED_COMMIT_BATCH) {
		if (i > 0 && !(await isRecommendationsEnabled(serverId))) {
			log.info(
				{ serverId },
				"Recommendations disabled mid-run, stopping embedding",
			);
			return false;
		}
		const batch = pending.slice(i, i + EMBED_COMMIT_BATCH);
		try {
			const vectors = await embedBatch(batch.map((b) => b.work.embeddingText));
			await repo.upsertEmbeddings(
				serverId,
				batch.flatMap((b, j) => {
					const vector = vectors[j];
					if (!vector) return [];
					return [
						{
							kind: b.work.kind,
							itemId: b.work.id,
							vector: Array.from(vector),
							inputHash: b.hash,
							model: EMBEDDING_MODEL,
						},
					];
				}),
			);
		} catch (error) {
			// degrade to structured-only for this run; never break the rebuild
			log.warn(
				{ error, serverId },
				"Embedding batch failed, continuing without embeddings",
			);
			return false;
		}
		await job?.updateProgress(
			Math.round(((i + batch.length) / Math.max(1, pending.length)) * 50),
		);
	}
	return true;
}

async function loadEmbeddingSpace(
	serverId: string,
): Promise<EmbeddingSpace | null> {
	const rows = await repo.loadEmbeddings(serverId);
	if (rows.length === 0) return null;
	return buildEmbeddingSpace(
		rows.map((r) => ({
			key: workKey(r.kind, r.itemId) as WorkKey,
			vector: r.vector,
		})),
	);
}

export interface RebuildResult {
	works: number;
	similarities: number;
	catalogChanged: boolean;
	engagementChanged: boolean;
}

export async function rebuildServer(
	serverId: string,
	options: { full?: boolean; job?: Job } = {},
): Promise<RebuildResult | { skipped: true; reason: string }> {
	if (!(await isRecommendationsEnabled(serverId))) {
		return { skipped: true, reason: "disabled" };
	}

	const catalogFpBase = await repo.computeCatalogFingerprint(serverId);
	const capability = await resolveCapability();
	// Hash + wrap in an object: a bare string does not survive the jsonb
	// round-trip intact (Postgres re-parses it), so equality would never hold.
	const catalogFp = await hashFingerprint(
		`${catalogFpBase}|w${WEIGHTS_VERSION}|m${capability.enabled ? capability.model : "none"}`,
	);
	const storedCatalogFp = await settingsRepository.getOrgValue<{ fp: string }>(
		serverId,
		CATALOG_FP_KEY,
	);
	const catalogChanged =
		options.full === true || storedCatalogFp?.fp !== catalogFp;

	const engagementFp = await hashFingerprint(
		await repo.computeEngagementFingerprint(serverId),
	);
	const storedEngagementFp = await settingsRepository.getOrgValue<{
		fp: string;
	}>(serverId, ENGAGEMENT_FP_KEY);
	const engagementChanged =
		options.full === true || storedEngagementFp?.fp !== engagementFp;

	if (!catalogChanged && !engagementChanged) {
		log.info({ serverId }, "Fingerprints unchanged, skipping rebuild");
		return { skipped: true, reason: "unchanged" };
	}

	// per-phase timings, logged once at the end so the actual bottleneck is
	// visible on prod hardware (dev catalogs are too small to profile against)
	const timings: Record<string, number> = {};
	const timed = async <T>(phase: string, fn: () => Promise<T>): Promise<T> => {
		const start = Date.now();
		try {
			return await fn();
		} finally {
			timings[phase] = Date.now() - start;
		}
	};

	const works = await timed("loadWorksMs", () =>
		repo.loadWorkAggregates(serverId),
	);
	let similarityCount = 0;

	if (catalogChanged) {
		await repo.deleteStaleEmbeddings(
			serverId,
			new Set(works.map((work) => workKey(work.kind, work.id))),
		);
		let pairs: ScoredPair[] = [];
		if (works.length > 0) {
			const embeddingsOk = await timed("embedMs", () =>
				embedChangedWorks(serverId, works, options.job),
			);
			const space = embeddingsOk ? await loadEmbeddingSpace(serverId) : null;
			const ctx = {
				idf: buildIdf(works),
				embeddingCos: space ? embeddingCosOf(space) : null,
			};
			pairs = await timed("similaritiesMs", async () =>
				generateSimilarities(works, ctx, space),
			);
			similarityCount = pairs.length;
		}
		// Also clear stale rows when the organization no longer has any works.
		await timed("writeSimilaritiesMs", () =>
			repo.replaceSimilarities(serverId, pairs),
		);
		await options.job?.updateProgress(80);
	}

	if (catalogChanged || engagementChanged) {
		await repo.replacePopularity(serverId, computePopularity(works));
	}

	// per-member feeds — each guarded by its own signals fingerprint unless full
	const { computeUserFeed } = await import("./user-feed.service");
	await repo.pruneNonMemberRecommendations(serverId);
	await repo.pruneInactiveMemberRecommendations(serverId);
	const memberIds = await repo.listActiveOrgMemberIds(serverId);
	await timed("feedsMs", async () => {
		for (let i = 0; i < memberIds.length; i += FEED_CONCURRENCY) {
			const batch = memberIds.slice(i, i + FEED_CONCURRENCY);
			await Promise.all(
				batch.map((memberId) =>
					computeUserFeed(serverId, memberId, {
						skipIfUnchanged: !options.full && !catalogChanged,
					}).catch((err) =>
						log.error(
							{ err, serverId, userId: memberId },
							"Failed to compute user feed",
						),
					),
				),
			);
			await options.job?.updateProgress(
				80 + Math.round(((i + batch.length) / memberIds.length) * 20),
			);
		}
	});

	await settingsRepository.upsertOrgValue(serverId, CATALOG_FP_KEY, {
		fp: catalogFp,
	});
	await settingsRepository.upsertOrgValue(serverId, ENGAGEMENT_FP_KEY, {
		fp: engagementFp,
	});
	await options.job?.updateProgress(100);

	log.info(
		{
			serverId,
			works: works.length,
			similarities: similarityCount,
			catalogChanged,
			engagementChanged,
			timings,
		},
		"Recommendations rebuilt",
	);
	return {
		works: works.length,
		similarities: similarityCount,
		catalogChanged,
		engagementChanged,
	};
}
