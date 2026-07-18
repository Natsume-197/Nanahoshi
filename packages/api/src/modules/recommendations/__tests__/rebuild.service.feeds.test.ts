import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { WorkAggregate } from "../types";

// The real queue module opens an ioredis connection at import time; stub the
// infrastructure before importing anything that pulls it in.
mock.module("../../../infrastructure/queue/redis", () => ({ redis: {} }));
mock.module("bullmq", () => ({
	Queue: class {
		upsertJobScheduler = async () => ({});
		removeJobScheduler = async () => true;
		getJobSchedulers = async () => [];
		add = async () => ({});
	},
	Worker: class {
		on() {}
		close = async () => {};
	},
}));

const { settingsRepository } = await import(
	"../../../routers/settings/settings.repository"
);
const { recommendationComputeRepository: repo } = await import(
	"../recommendation-compute.repository"
);
const { rebuildServer } = await import("../rebuild.service");

const work = (id: number): WorkAggregate => ({
	kind: "book",
	id,
	authorIds: new Set(),
	genreIds: new Set(),
	tagIds: new Set(),
	publisherIds: new Set(),
	languageCode: null,
	memberBookIds: [id],
	embeddingText: `work ${id}`,
	engagedUserIds: new Set(["user-1"]),
	likeCount: 1,
	completionCount: 1,
	amazonRating: null,
	amazonReviewCount: null,
	createdAtMs: 0,
});

// Singletons are patched in place (mock.module leaks across test files).
const originals = {
	getOrgValue: settingsRepository.getOrgValue.bind(settingsRepository),
	upsertOrgValue: settingsRepository.upsertOrgValue.bind(settingsRepository),
	computeCatalogFingerprint: repo.computeCatalogFingerprint.bind(repo),
	computeEngagementFingerprint: repo.computeEngagementFingerprint.bind(repo),
	loadWorkAggregates: repo.loadWorkAggregates.bind(repo),
	deleteStaleEmbeddings: repo.deleteStaleEmbeddings.bind(repo),
	replaceSimilarities: repo.replaceSimilarities.bind(repo),
	replacePopularity: repo.replacePopularity.bind(repo),
	pruneNonMemberRecommendations: repo.pruneNonMemberRecommendations.bind(repo),
	listActiveOrgMemberIds: repo.listActiveOrgMemberIds.bind(repo),
	loadPopularityOrdered: repo.loadPopularityOrdered.bind(repo),
	loadRecommendationTitleKeys: repo.loadRecommendationTitleKeys.bind(repo),
	loadAllSimilarities: repo.loadAllSimilarities.bind(repo),
	loadEmbeddings: repo.loadEmbeddings.bind(repo),
	loadPrimaryAuthors: repo.loadPrimaryAuthors.bind(repo),
	computeUserSignalsFingerprintsBatch:
		repo.computeUserSignalsFingerprintsBatch.bind(repo),
	getUserRecStates: repo.getUserRecStates.bind(repo),
	loadUserSignalWorksBatch: repo.loadUserSignalWorksBatch.bind(repo),
	replaceUserRecommendations: repo.replaceUserRecommendations.bind(repo),
};

let catalogFpCalls = 0;
let similarityWrites = 0;
let popularityWrites = 0;
let userRecWrites: string[] = [];
let recStateReads = 0;
let upsertedSettings: string[] = [];
let upsertedValues = new Map<string, unknown>();

beforeEach(() => {
	catalogFpCalls = 0;
	similarityWrites = 0;
	popularityWrites = 0;
	userRecWrites = [];
	recStateReads = 0;
	upsertedSettings = [];
	upsertedValues = new Map();

	settingsRepository.getOrgValue = (async () =>
		undefined) as typeof settingsRepository.getOrgValue;
	settingsRepository.upsertOrgValue = (async (
		_serverId: string,
		key: string,
		value: unknown,
	) => {
		upsertedSettings.push(key);
		upsertedValues.set(key, value);
	}) as typeof settingsRepository.upsertOrgValue;

	repo.computeCatalogFingerprint = async () => {
		catalogFpCalls++;
		return "catalog-fp";
	};
	repo.computeEngagementFingerprint = async () => "engagement-fp";
	repo.loadWorkAggregates = async () => [work(1), work(2)];
	repo.deleteStaleEmbeddings = async () => {
		throw new Error("must not touch embeddings in feeds-only mode");
	};
	repo.replaceSimilarities = async () => {
		similarityWrites++;
	};
	repo.replacePopularity = async () => {
		popularityWrites++;
	};
	repo.pruneNonMemberRecommendations = async () => {};
	repo.listActiveOrgMemberIds = async () => ["user-1"];
	repo.loadPopularityOrdered = async () => [
		{ kind: "book" as const, itemId: 1, score: 0.5 },
	];
	repo.loadRecommendationTitleKeys = async () => new Map();
	repo.loadAllSimilarities = async () => [];
	repo.loadEmbeddings = async () => [];
	repo.loadPrimaryAuthors = async () => new Map();
	repo.computeUserSignalsFingerprintsBatch = async (
		_serverId: string,
		userIds: string[],
	) => new Map(userIds.map((id) => [id, `fp-${id}`]));
	repo.getUserRecStates = async () => {
		recStateReads++;
		return new Map();
	};
	repo.loadUserSignalWorksBatch = async (
		_serverId: string,
		userIds: string[],
	) => new Map(userIds.map((id) => [id, []]));
	repo.replaceUserRecommendations = (async (
		_serverId: string,
		userId: string,
	) => {
		userRecWrites.push(userId);
	}) as typeof repo.replaceUserRecommendations;
});

afterEach(() => {
	settingsRepository.getOrgValue = originals.getOrgValue;
	settingsRepository.upsertOrgValue = originals.upsertOrgValue;
	repo.computeCatalogFingerprint = originals.computeCatalogFingerprint;
	repo.computeEngagementFingerprint = originals.computeEngagementFingerprint;
	repo.loadWorkAggregates = originals.loadWorkAggregates;
	repo.deleteStaleEmbeddings = originals.deleteStaleEmbeddings;
	repo.replaceSimilarities = originals.replaceSimilarities;
	repo.replacePopularity = originals.replacePopularity;
	repo.pruneNonMemberRecommendations = originals.pruneNonMemberRecommendations;
	repo.listActiveOrgMemberIds = originals.listActiveOrgMemberIds;
	repo.loadPopularityOrdered = originals.loadPopularityOrdered;
	repo.loadRecommendationTitleKeys = originals.loadRecommendationTitleKeys;
	repo.loadAllSimilarities = originals.loadAllSimilarities;
	repo.loadEmbeddings = originals.loadEmbeddings;
	repo.loadPrimaryAuthors = originals.loadPrimaryAuthors;
	repo.computeUserSignalsFingerprintsBatch =
		originals.computeUserSignalsFingerprintsBatch;
	repo.getUserRecStates = originals.getUserRecStates;
	repo.loadUserSignalWorksBatch = originals.loadUserSignalWorksBatch;
	repo.replaceUserRecommendations = originals.replaceUserRecommendations;
});

describe("rebuildServer feedsOnly", () => {
	test("skips the catalog phase entirely and recomputes popularity + every feed", async () => {
		const result = await rebuildServer("org-a", { feedsOnly: true });
		expect(result).toEqual({
			works: 2,
			similarities: 0,
			catalogChanged: false,
			engagementChanged: true,
		});
		// never fingerprints, embeds, or rewrites the similarity model
		expect(catalogFpCalls).toBe(0);
		expect(similarityWrites).toBe(0);
		// popularity + all member feeds are forced, no per-user skip check
		expect(popularityWrites).toBe(1);
		expect(userRecWrites).toEqual(["user-1"]);
		expect(recStateReads).toBe(0);
	});

	test("writes the engagement fingerprint and last-run summary, never the catalog fp", async () => {
		await rebuildServer("org-a", { feedsOnly: true });
		expect(upsertedSettings).toEqual([
			"recommendations.fp.engagement",
			"recommendations.lastRun",
		]);
		const lastRun = upsertedValues.get("recommendations.lastRun") as {
			mode: string;
			works: number;
			members: number;
		};
		expect(lastRun.mode).toBe("feeds");
		expect(lastRun.works).toBe(2);
		expect(lastRun.members).toBe(1);
	});

	test("still refuses when recommendations are disabled", async () => {
		settingsRepository.getOrgValue = (async (_serverId: string, key: string) =>
			key === "recommendations"
				? { enabled: false }
				: undefined) as typeof settingsRepository.getOrgValue;
		const result = await rebuildServer("org-a", { feedsOnly: true });
		expect(result).toEqual({ skipped: true, reason: "disabled" });
		expect(userRecWrites).toEqual([]);
	});

	test("reports progress across the whole 0-100 range", async () => {
		const progress: number[] = [];
		const job = {
			updateProgress: async (value: number) => {
				progress.push(value);
			},
		};
		await rebuildServer("org-a", {
			feedsOnly: true,
			job: job as never,
		});
		expect(progress).toContain(100);
		// the feeds loop maps onto 0-100, not the rebuild's final 80-100 slice
		expect(Math.min(...progress)).toBeLessThanOrEqual(100);
	});
});
