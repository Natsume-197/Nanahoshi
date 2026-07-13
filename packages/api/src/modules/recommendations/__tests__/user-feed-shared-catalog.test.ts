import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { recommendationComputeRepository as repo } from "../recommendation-compute.repository";
import type { WorkAggregate } from "../types";
import {
	buildUserMixesPreview,
	computeUserFeed,
	loadUserFeedSharedContext,
	type UserFeedSignalInput,
} from "../user-feed.service";

// Singletons patched in place (mock.module leaks across test files).
const originals = {
	sims: repo.loadSimilaritiesForSeeds.bind(repo),
	allSims: repo.loadAllSimilarities.bind(repo),
	pop: repo.loadPopularityOrdered.bind(repo),
	emb: repo.loadEmbeddingsByKeys.bind(repo),
	allEmb: repo.loadEmbeddings.bind(repo),
	authors: repo.loadPrimaryAuthors.bind(repo),
	titles: repo.loadRecommendationTitleKeys.bind(repo),
	fp: repo.computeUserSignalsFingerprint.bind(repo),
	signals: repo.loadUserSignalWorks.bind(repo),
	state: repo.getUserRecState.bind(repo),
	replace: repo.replaceUserRecommendations.bind(repo),
};

type SimRow = {
	seedKind: "series" | "book";
	seedId: number;
	candKind: "series" | "book";
	candId: number;
	score: number;
	components: Record<string, number>;
	reason: string;
};

// per-seed rows ordered score DESC, mirroring the SQL ORDER BY
const SIM_ROWS: SimRow[] = [
	{
		seedKind: "book",
		seedId: 5,
		candKind: "book",
		candId: 7,
		score: 0.8,
		components: { cooc: 0.8 },
		reason: "readers_also_liked",
	},
	{
		seedKind: "book",
		seedId: 5,
		candKind: "series",
		candId: 3,
		score: 0.45,
		components: { genre: 0.5 },
		reason: "shared_genres",
	},
	{
		seedKind: "series",
		seedId: 1,
		candKind: "series",
		candId: 2,
		score: 0.9,
		components: { author: 0.9 },
		reason: "same_author",
	},
	{
		seedKind: "series",
		seedId: 1,
		candKind: "series",
		candId: 3,
		score: 0.6,
		components: { embedding: 0.7 },
		reason: "similar_content",
	},
	{
		seedKind: "series",
		seedId: 1,
		candKind: "book",
		candId: 8,
		score: 0.5,
		components: { tag: 0.4 },
		reason: "shared_genres",
	},
	{
		seedKind: "series",
		seedId: 9,
		candKind: "series",
		candId: 2,
		score: 0.7,
		components: { genre: 0.6 },
		reason: "shared_genres",
	},
];

const EMBEDDINGS: {
	kind: "series" | "book";
	itemId: number;
	vector: number[];
}[] = [
	{ kind: "series", itemId: 1, vector: [1, 0, 0, 0] },
	{ kind: "series", itemId: 2, vector: [0.9, 0.1, 0, 0] },
	{ kind: "series", itemId: 3, vector: [0, 1, 0, 0] },
	{ kind: "book", itemId: 5, vector: [0, 0.9, 0.1, 0] },
	{ kind: "book", itemId: 7, vector: [0, 0, 1, 0] },
];

const ALL_WORK_KEYS = [
	{ kind: "series" as const, id: 1 },
	{ kind: "series" as const, id: 2 },
	{ kind: "series" as const, id: 3 },
	{ kind: "series" as const, id: 9 },
	{ kind: "book" as const, id: 5 },
	{ kind: "book" as const, id: 7 },
	{ kind: "book" as const, id: 8 },
	{ kind: "book" as const, id: 20 },
];

const NOW = 1_800_000_000_000;

const SIGNALS: UserFeedSignalInput[] = [
	{ kind: "series", itemId: 1, signal: "like", atMs: NOW - 10 * 86_400_000 },
	{ kind: "book", itemId: 5, signal: "completed", atMs: NOW - 40 * 86_400_000 },
	{
		kind: "series",
		itemId: 9,
		signal: "abandoned",
		atMs: NOW - 30 * 86_400_000,
	},
];

beforeEach(() => {
	repo.loadSimilaritiesForSeeds = async (_serverId, seeds) => {
		const wanted = new Set(seeds.map((s) => `${s.kind}:${s.id}`));
		return SIM_ROWS.filter((r) => wanted.has(`${r.seedKind}:${r.seedId}`));
	};
	repo.loadAllSimilarities = async () => [...SIM_ROWS];
	repo.loadPopularityOrdered = async () => [
		{ kind: "series", itemId: 2, score: 0.9 },
		{ kind: "book", itemId: 20, score: 0.7 },
		{ kind: "series", itemId: 3, score: 0.4 },
	];
	repo.loadEmbeddingsByKeys = async (_serverId, keys) => {
		const wanted = new Set(keys.map((k) => `${k.kind}:${k.id}`));
		return EMBEDDINGS.filter((e) => wanted.has(`${e.kind}:${e.itemId}`));
	};
	repo.loadEmbeddings = async () => [...EMBEDDINGS];
	repo.loadPrimaryAuthors = async (_serverId, keys) =>
		new Map(keys.map((k) => [`${k.kind}:${k.id}`, k.id % 3]));
	repo.loadRecommendationTitleKeys = async (_serverId, keys) =>
		new Map(keys.map((k) => [`${k.kind}:${k.id}`, `title-${k.id}`]));
});

afterEach(() => {
	repo.loadSimilaritiesForSeeds = originals.sims;
	repo.loadAllSimilarities = originals.allSims;
	repo.loadPopularityOrdered = originals.pop;
	repo.loadEmbeddingsByKeys = originals.emb;
	repo.loadEmbeddings = originals.allEmb;
	repo.loadPrimaryAuthors = originals.authors;
	repo.loadRecommendationTitleKeys = originals.titles;
	repo.computeUserSignalsFingerprint = originals.fp;
	repo.loadUserSignalWorks = originals.signals;
	repo.getUserRecState = originals.state;
	repo.replaceUserRecommendations = originals.replace;
});

describe("shared full-catalog context", () => {
	test("produces the same mixes as the per-user query path", async () => {
		const works = ALL_WORK_KEYS.map(
			(k) => ({ kind: k.kind, id: k.id }) as WorkAggregate,
		);

		const perUser = await buildUserMixesPreview("org-1", SIGNALS, NOW);
		const shared = await loadUserFeedSharedContext("org-1", { works });
		const viaCatalog = await buildUserMixesPreview(
			"org-1",
			SIGNALS,
			NOW,
			shared,
		);

		expect(viaCatalog).toEqual(perUser);
		expect(viaCatalog.length).toBeGreaterThan(0);
	});

	test("cold-start fallback matches too", async () => {
		const works = ALL_WORK_KEYS.map(
			(k) => ({ kind: k.kind, id: k.id }) as WorkAggregate,
		);
		const perUser = await buildUserMixesPreview("org-1", [], NOW);
		const shared = await loadUserFeedSharedContext("org-1", { works });
		const viaCatalog = await buildUserMixesPreview("org-1", [], NOW, shared);
		expect(viaCatalog).toEqual(perUser);
		expect(viaCatalog[0]?.items.length).toBeGreaterThan(0);
	});
});

describe("computeUserFeed preloaded inputs", () => {
	test("uses preloaded fingerprint and signals without per-user queries", async () => {
		repo.computeUserSignalsFingerprint = async () => {
			throw new Error("per-user fingerprint should not run");
		};
		repo.loadUserSignalWorks = async () => {
			throw new Error("per-user signal load should not run");
		};
		let saved: { userId: string; signalsFp: string; mixCount: number } | null =
			null;
		repo.replaceUserRecommendations = async (
			_serverId,
			userId,
			mixes,
			signalsFp,
		) => {
			saved = { userId, signalsFp, mixCount: mixes.length };
		};

		const result = await computeUserFeed("org-1", "user-a", {
			preloaded: { signalsFp: "fp-batch", signalRows: SIGNALS },
		});
		expect(result).toEqual({ mixes: expect.any(Number) });
		expect(saved).not.toBeNull();
		expect(saved?.signalsFp).toBe("fp-batch");
		expect(saved?.userId).toBe("user-a");
	});
});
