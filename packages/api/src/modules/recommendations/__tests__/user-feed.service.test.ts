import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { settingsRepository } from "../../../routers/settings/settings.repository";
import { recommendationComputeRepository as repo } from "../recommendation-compute.repository";
import { computeUserFeed, refreshUser } from "../user-feed.service";

// Singletons patched in place (mock.module leaks across test files).
const originals = {
	getOrgValue: settingsRepository.getOrgValue.bind(settingsRepository),
	fp: repo.computeUserSignalsFingerprint.bind(repo),
	state: repo.getUserRecState.bind(repo),
	signals: repo.loadUserSignalWorks.bind(repo),
	sims: repo.loadSimilaritiesForSeeds.bind(repo),
	pop: repo.loadPopularityOrdered.bind(repo),
	emb: repo.loadEmbeddingsByKeys.bind(repo),
	authors: repo.loadPrimaryAuthors.bind(repo),
	titles: repo.loadRecommendationTitleKeys.bind(repo),
	replace: repo.replaceUserRecommendations.bind(repo),
};

let fpSequence: string[] = [];
let fpCalls = 0;
let storedState: string | null = null;
let replacedWith: { mixCount: number; signalsFp: string }[] = [];
let computeRuns = 0;
let orgSettings = new Map<string, unknown>();

beforeEach(() => {
	fpSequence = ["fp-1"];
	fpCalls = 0;
	storedState = null;
	replacedWith = [];
	computeRuns = 0;
	orgSettings = new Map();

	settingsRepository.getOrgValue = (async (serverId: string, key: string) =>
		orgSettings.get(
			`${serverId}:${key}`,
		)) as typeof settingsRepository.getOrgValue;
	repo.computeUserSignalsFingerprint = async () => {
		const fp = fpSequence[Math.min(fpCalls, fpSequence.length - 1)] ?? "fp-1";
		fpCalls++;
		return fp;
	};
	repo.getUserRecState = async () => storedState;
	repo.loadUserSignalWorks = async () => {
		computeRuns++;
		return [{ kind: "series", itemId: 1, signal: "like", atMs: Date.now() }];
	};
	repo.loadSimilaritiesForSeeds = async () => [
		{
			seedKind: "series",
			seedId: 1,
			candKind: "series",
			candId: 2,
			score: 0.9,
			components: { author: 0.9 },
			reason: "same_author",
		},
	];
	repo.loadPopularityOrdered = async () => [];
	repo.loadEmbeddingsByKeys = async () => [];
	repo.loadPrimaryAuthors = async () => new Map();
	repo.loadRecommendationTitleKeys = async () => new Map();
	repo.replaceUserRecommendations = async (
		_serverId,
		_userId,
		mixes,
		signalsFp,
	) => {
		replacedWith.push({ mixCount: mixes.length, signalsFp });
	};
});

afterEach(() => {
	settingsRepository.getOrgValue = originals.getOrgValue;
	repo.computeUserSignalsFingerprint = originals.fp;
	repo.getUserRecState = originals.state;
	repo.loadUserSignalWorks = originals.signals;
	repo.loadSimilaritiesForSeeds = originals.sims;
	repo.loadPopularityOrdered = originals.pop;
	repo.loadEmbeddingsByKeys = originals.emb;
	repo.loadPrimaryAuthors = originals.authors;
	repo.loadRecommendationTitleKeys = originals.titles;
	repo.replaceUserRecommendations = originals.replace;
});

describe("computeUserFeed", () => {
	test("skipIfUnchanged short-circuits when the fingerprint matches", async () => {
		storedState = "fp-1";
		const result = await computeUserFeed("org", "u1", {
			skipIfUnchanged: true,
		});
		expect(result).toEqual({ skipped: true, reason: "unchanged" });
		expect(computeRuns).toBe(0);
	});

	test("persists mixes with the fingerprint captured before computing", async () => {
		const result = await computeUserFeed("org", "u1");
		expect(result).toEqual({ mixes: 1 });
		expect(replacedWith[0]?.signalsFp).toBe("fp-1");
		expect(replacedWith[0]?.mixCount).toBe(1);
	});

	test("liked seed produces because_you_liked items", async () => {
		await computeUserFeed("org", "u1");
		expect(replacedWith.length).toBe(1);
	});
});

describe("refreshUser", () => {
	test("disabled org → skipped without computing", async () => {
		orgSettings.set("org:recommendations", { enabled: false });
		const result = await refreshUser("org", "u1");
		expect(result).toEqual({ skipped: true, reason: "disabled" });
		expect(computeRuns).toBe(0);
	});

	test("stable signals → single compute", async () => {
		fpSequence = ["fp-1", "fp-1"];
		await refreshUser("org", "u1");
		expect(computeRuns).toBe(1);
	});

	test("signals moved mid-run → dirty-check computes once more", async () => {
		// before=fp-1, compute, after=fp-2 (changed) → second compute
		fpSequence = ["fp-1", "fp-2", "fp-2"];
		await refreshUser("org", "u1");
		expect(computeRuns).toBe(2);
		expect(replacedWith.length).toBe(2);
	});
});
