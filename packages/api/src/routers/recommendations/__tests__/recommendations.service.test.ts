import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { settingsRepository } from "../../settings/settings.repository";
import { impressionStore } from "../impression.store";
import type {
	ContinueSeriesRow,
	RepresentativeRow,
} from "../recommendations.repository";
import { recommendationsRepository } from "../recommendations.repository";
import * as service from "../recommendations.service";

// Singletons patched in place (mock.module leaks across test files).
const originalGetOrgValue =
	settingsRepository.getOrgValue.bind(settingsRepository);
const originalHeaders = recommendationsRepository.listMixHeaders.bind(
	recommendationsRepository,
);
const originalItems = recommendationsRepository.listMixItems.bind(
	recommendationsRepository,
);
const originalSimilar = recommendationsRepository.listSimilar.bind(
	recommendationsRepository,
);
const originalPopular = recommendationsRepository.topPopular.bind(
	recommendationsRepository,
);
const originalResolveWork = recommendationsRepository.resolveWorkForBook.bind(
	recommendationsRepository,
);
const originalDismissed = recommendationsRepository.loadDismissedWorks.bind(
	recommendationsRepository,
);
const originalSeeds = recommendationsRepository.loadRecentPositiveSeeds.bind(
	recommendationsRepository,
);
const originalSeedSims = recommendationsRepository.loadSeedSimilarities.bind(
	recommendationsRepository,
);
const originalContinueSeries =
	recommendationsRepository.listContinueSeries.bind(recommendationsRepository);
const originalImpressionLoad = impressionStore.load.bind(impressionStore);
const originalImpressionRecord = impressionStore.record.bind(impressionStore);

let orgSettings = new Map<string, unknown>();
let mixHeaders: Awaited<ReturnType<typeof originalHeaders>> = [];
let mixItems: RepresentativeRow[] = [];
let similarRows: RepresentativeRow[] = [];
let popularRows: RepresentativeRow[] = [];
let resolvedWork: { kind: "series" | "book"; id: number } | null = null;
let dismissed = new Set<string>();
let recentSeeds: Awaited<ReturnType<typeof originalSeeds>> = [];
let seedSims: Awaited<ReturnType<typeof originalSeedSims>> = [];
let continueSeriesRows: ContinueSeriesRow[] = [];
let impressions = new Map<string, { count: number; lastMs: number }>();
let recordedImpressions: string[][] = [];

function row(overrides: Partial<RepresentativeRow> = {}): RepresentativeRow {
	return {
		kind: "series",
		itemId: 1,
		score: 0.9,
		reason: "same_author",
		reasonTitle: "Seed Series",
		mixIndex: 0,
		rank: 0,
		seriesUuid: "s-uuid",
		seriesName: "Some Series",
		bookUuid: "b-uuid",
		bookTitle: "Vol 1",
		bookFilename: "vol1.epub",
		bookCover: null,
		bookMainColor: null,
		bookMediaType: "ebook",
		authors: [{ uuid: "a-uuid", name: "Author" }],
		representativeCompleted: false,
		...overrides,
	};
}

beforeEach(() => {
	orgSettings = new Map();
	mixHeaders = [];
	mixItems = [];
	similarRows = [];
	popularRows = [];
	resolvedWork = null;
	dismissed = new Set();
	recentSeeds = [];
	seedSims = [];
	continueSeriesRows = [];
	impressions = new Map();
	recordedImpressions = [];

	settingsRepository.getOrgValue = (async (serverId: string, key: string) =>
		orgSettings.get(
			`${serverId}:${key}`,
		)) as typeof settingsRepository.getOrgValue;
	recommendationsRepository.listMixHeaders = async () => mixHeaders;
	recommendationsRepository.listMixItems = async () => mixItems;
	recommendationsRepository.listSimilar = async () => similarRows;
	recommendationsRepository.topPopular = async () => popularRows;
	recommendationsRepository.resolveWorkForBook = async () => resolvedWork;
	recommendationsRepository.loadDismissedWorks = async () => dismissed;
	recommendationsRepository.loadRecentPositiveSeeds = async () => recentSeeds;
	recommendationsRepository.loadSeedSimilarities = async () => seedSims;
	recommendationsRepository.listContinueSeries = async () => continueSeriesRows;
	impressionStore.load = async () => impressions;
	impressionStore.record = (async (
		_serverId: string,
		_userId: string,
		workKeys: string[],
	) => {
		recordedImpressions.push(workKeys);
	}) as typeof impressionStore.record;
});

afterEach(() => {
	settingsRepository.getOrgValue = originalGetOrgValue;
	recommendationsRepository.listMixHeaders = originalHeaders;
	recommendationsRepository.listMixItems = originalItems;
	recommendationsRepository.listSimilar = originalSimilar;
	recommendationsRepository.topPopular = originalPopular;
	recommendationsRepository.resolveWorkForBook = originalResolveWork;
	recommendationsRepository.loadDismissedWorks = originalDismissed;
	recommendationsRepository.loadRecentPositiveSeeds = originalSeeds;
	recommendationsRepository.loadSeedSimilarities = originalSeedSims;
	recommendationsRepository.listContinueSeries = originalContinueSeries;
	impressionStore.load = originalImpressionLoad;
	impressionStore.record = originalImpressionRecord;
});

describe("forUser", () => {
	test("recommendations disabled → enabled:false and no repository reads", async () => {
		orgSettings.set("org-a:recommendations", { enabled: false });
		const result = await service.forUser("u1", "org-a", "ALL", {
			format: "all",
			perMixLimit: 15,
		});
		expect(result).toEqual({ enabled: false, mixes: [] });
	});

	test("personalized mixes can be disabled while similar titles stay enabled", async () => {
		orgSettings.set("org-a:recommendations", {
			enabled: true,
			personalizedEnabled: false,
			similarEnabled: true,
		});
		const result = await service.forUser("u1", "org-a", "ALL", {
			format: "all",
			perMixLimit: 15,
		});
		expect(result).toEqual({ enabled: false, mixes: [] });
	});

	test("groups items under their mix and drops empty mixes", async () => {
		mixHeaders = [
			{ mixIndex: 0, anchorTitle: "Liked Series", hasAnchor: true },
			{ mixIndex: 1, anchorTitle: null, hasAnchor: true },
		];
		// mix 1 has no surviving items after permission filtering
		mixItems = [row({ mixIndex: 0 })];
		const result = await service.forUser("u1", "org-a", "ALL", {
			format: "all",
			perMixLimit: 15,
		});
		expect(result.enabled).toBe(true);
		expect(result.mixes.length).toBe(1);
		expect(result.mixes[0]?.anchorTitle).toBe("Liked Series");
	});

	test("records an impression for every served row", async () => {
		mixHeaders = [
			{ mixIndex: 0, anchorTitle: "Liked Series", hasAnchor: true },
		];
		mixItems = [
			row({ mixIndex: 0, kind: "series", itemId: 1 }),
			row({ mixIndex: 0, kind: "book", itemId: 2, bookUuid: "b2" }),
		];
		await service.forUser("u1", "org-a", "ALL", {
			format: "all",
			perMixLimit: 15,
		});
		expect(recordedImpressions).toEqual([["series:1", "book:2"]]);
	});

	test("records only the rows that fit in the composed dashboard rail", async () => {
		mixHeaders = [
			{ mixIndex: 0, anchorTitle: "Taste A", hasAnchor: true },
			{ mixIndex: 1, anchorTitle: "Taste B", hasAnchor: true },
		];
		mixItems = Array.from({ length: 28 }, (_, index) =>
			row({
				kind: "book",
				itemId: index + 1,
				bookUuid: `book-${index + 1}`,
				mixIndex: index % 2,
				rank: Math.floor(index / 2),
				score: 1 - index / 100,
			}),
		);

		const result = await service.forUser("u1", "org-a", "ALL", {
			format: "books",
			perMixLimit: 14,
		});
		const served = result.mixes.flatMap((mix) => mix.items);

		expect(served).toHaveLength(14);
		expect(recordedImpressions[0]).toHaveLength(14);
	});

	test("a new visit rotates an unseen near-tie into the visible rail", async () => {
		mixHeaders = [{ mixIndex: 0, anchorTitle: "Taste", hasAnchor: true }];
		mixItems = Array.from({ length: 15 }, (_, index) =>
			row({
				kind: "book",
				itemId: index + 1,
				bookUuid: `book-${index + 1}`,
				rank: index,
				score: 0.9 - index / 1000,
			}),
		);
		impressions = new Map(
			Array.from({ length: 14 }, (_, index) => [
				`book:${index + 1}`,
				{ count: 1, lastMs: 0 },
			]),
		);

		const result = await service.forUser("u1", "org-a", "ALL", {
			format: "books",
			perMixLimit: 14,
		});
		const served = result.mixes.flatMap((mix) =>
			mix.items.map((item) => item.book.uuid),
		);

		expect(served).toContain("book-15");
		expect(served).not.toContain("book-14");
	});

	test("an over-shown row is demoted below a fresh near-tie", async () => {
		mixHeaders = [{ mixIndex: 0, anchorTitle: null, hasAnchor: false }];
		mixItems = [
			row({
				mixIndex: 0,
				kind: "book",
				itemId: 1,
				bookUuid: "stale",
				score: 0.9,
				rank: 0,
			}),
			row({
				mixIndex: 0,
				kind: "book",
				itemId: 2,
				bookUuid: "fresh",
				score: 0.85,
				rank: 1,
			}),
		];
		impressions = new Map([["book:1", { count: 8, lastMs: 0 }]]);
		const result = await service.forUser("u1", "org-a", "ALL", {
			format: "all",
			perMixLimit: 15,
		});
		expect(result.mixes[0]?.items.map((i) => i.book.uuid)).toEqual([
			"fresh",
			"stale",
		]);
	});

	test("no computed rows → popularity fallback", async () => {
		popularRows = [row({ reason: "popular", reasonTitle: null })];
		const result = await service.forUser("u1", "org-a", "ALL", {
			format: "all",
			perMixLimit: 15,
		});
		expect(result.mixes.length).toBe(1);
		expect(result.mixes[0]?.items[0]?.reason.type).toBe("popular");
	});

	test("partially populated mixes are backfilled to the requested rail size", async () => {
		mixHeaders = [
			{ mixIndex: 0, anchorTitle: "Liked Series", hasAnchor: true },
		];
		mixItems = [
			row({ kind: "book", itemId: 1, bookUuid: "personal-1", rank: 0 }),
			row({ kind: "book", itemId: 2, bookUuid: "personal-2", rank: 1 }),
		];
		popularRows = Array.from({ length: 13 }, (_, index) =>
			row({
				kind: "book",
				itemId: index + 3,
				bookUuid: `popular-${index + 1}`,
				reason: "popular",
				reasonTitle: null,
			}),
		);

		const result = await service.forUser("u1", "org-a", "ALL", {
			format: "books",
			perMixLimit: 15,
		});
		const served = result.mixes.flatMap((mix) => mix.items);

		expect(served).toHaveLength(15);
		expect(new Set(served.map((item) => item.book.uuid)).size).toBe(15);
		expect(
			served.filter((item) => item.reason.type === "popular"),
		).toHaveLength(13);
	});

	test("popular backfill excludes duplicate, completed, and dismissed works", async () => {
		mixHeaders = [
			{ mixIndex: 0, anchorTitle: "Liked Series", hasAnchor: true },
		];
		mixItems = [
			row({ kind: "book", itemId: 1, bookUuid: "personal-1", rank: 0 }),
			row({ kind: "book", itemId: 2, bookUuid: "personal-2", rank: 1 }),
		];
		popularRows = [
			row({
				kind: "book",
				itemId: 1,
				bookUuid: "same-work-different-volume",
				reason: "popular",
			}),
			row({
				kind: "book",
				itemId: 3,
				bookUuid: "personal-2",
				reason: "popular",
			}),
			row({
				kind: "book",
				itemId: 4,
				bookUuid: "completed",
				representativeCompleted: true,
				reason: "popular",
			}),
			row({
				kind: "book",
				itemId: 5,
				bookUuid: "dismissed",
				reason: "popular",
			}),
			...Array.from({ length: 3 }, (_, index) =>
				row({
					kind: "book",
					itemId: index + 6,
					bookUuid: `fill-${index + 1}`,
					reason: "popular",
				}),
			),
		];
		dismissed = new Set(["book:5"]);

		const result = await service.forUser("u1", "org-a", "ALL", {
			format: "books",
			perMixLimit: 5,
		});

		expect(
			result.mixes.flatMap((mix) => mix.items.map((item) => item.book.uuid)),
		).toEqual(["personal-1", "personal-2", "fill-1", "fill-2", "fill-3"]);
	});

	test("drops a work whose shown volume is already completed", async () => {
		mixHeaders = [{ mixIndex: 0, anchorTitle: null, hasAnchor: true }];
		mixItems = [
			row({ itemId: 1, bookUuid: "b1", representativeCompleted: true }),
			row({ itemId: 2, bookUuid: "b2", representativeCompleted: false }),
		];
		const result = await service.forUser("u1", "org-a", "ALL", {
			format: "all",
			perMixLimit: 15,
		});
		const uuids = result.mixes[0]?.items.map((i) => i.book.uuid);
		expect(uuids).toEqual(["b2"]);
	});

	test("drops a freshly dismissed work before the debounced refresh", async () => {
		mixHeaders = [{ mixIndex: 0, anchorTitle: null, hasAnchor: true }];
		mixItems = [
			row({ kind: "series", itemId: 7, bookUuid: "keep" }),
			row({ kind: "book", itemId: 9, bookUuid: "gone" }),
		];
		dismissed = new Set(["book:9"]);
		const result = await service.forUser("u1", "org-a", "ALL", {
			format: "all",
			perMixLimit: 15,
		});
		const uuids = result.mixes[0]?.items.map((i) => i.book.uuid);
		expect(uuids).toEqual(["keep"]);
	});

	test("re-caps each mix to perMixLimit after dropping suppressed rows", async () => {
		mixHeaders = [{ mixIndex: 0, anchorTitle: null, hasAnchor: true }];
		// one completed row up front, then 3 live ones; perMixLimit 2 → first two live
		mixItems = [
			row({ itemId: 1, bookUuid: "done", representativeCompleted: true }),
			row({ itemId: 2, bookUuid: "a" }),
			row({ itemId: 3, bookUuid: "b" }),
			row({ itemId: 4, bookUuid: "c" }),
		];
		const result = await service.forUser("u1", "org-a", "ALL", {
			format: "all",
			perMixLimit: 2,
		});
		const uuids = result.mixes[0]?.items.map((i) => i.book.uuid);
		expect(uuids).toEqual(["a", "b"]);
	});

	test("a recent seed lifts a similar-but-lower-ranked candidate within its mix", async () => {
		mixHeaders = [{ mixIndex: 0, anchorTitle: null, hasAnchor: true }];
		// batch order: top (score 0.90, rank 0) then low (score 0.80, rank 1)
		mixItems = [
			row({ kind: "book", itemId: 1, bookUuid: "top", score: 0.9, rank: 0 }),
			row({ kind: "book", itemId: 2, bookUuid: "low", score: 0.8, rank: 1 }),
		];
		// user just engaged with seed 99, strongly similar to the low candidate
		recentSeeds = [{ kind: "book", itemId: 99, atMs: Date.now() }];
		seedSims = [
			{ seedKind: "book", seedId: 99, candKind: "book", candId: 2, score: 1 },
		];
		const result = await service.forUser("u1", "org-a", "ALL", {
			format: "all",
			perMixLimit: 15,
		});
		// 0.80 + 0.08*1 = 0.88 < 0.90 → order unchanged (bounded nudge respects a clear gap)
		expect(result.mixes[0]?.items.map((i) => i.book.uuid)).toEqual([
			"top",
			"low",
		]);

		// near-tie: shrink the gap so the same boost now overtakes
		mixItems = [
			row({ kind: "book", itemId: 1, bookUuid: "top", score: 0.9, rank: 0 }),
			row({ kind: "book", itemId: 2, bookUuid: "low", score: 0.86, rank: 1 }),
		];
		const lifted = await service.forUser("u1", "org-a", "ALL", {
			format: "all",
			perMixLimit: 15,
		});
		// 0.86 + 0.08 = 0.94 > 0.90 → boosted candidate rises to the top
		expect(lifted.mixes[0]?.items.map((i) => i.book.uuid)).toEqual([
			"low",
			"top",
		]);
	});

	test("an old seed decays to ~0 → batch order preserved", async () => {
		mixHeaders = [{ mixIndex: 0, anchorTitle: null, hasAnchor: true }];
		mixItems = [
			row({ kind: "book", itemId: 1, bookUuid: "top", score: 0.9, rank: 0 }),
			row({ kind: "book", itemId: 2, bookUuid: "low", score: 0.86, rank: 1 }),
		];
		// same strong similarity, but the seed is a year old
		recentSeeds = [
			{ kind: "book", itemId: 99, atMs: Date.now() - 365 * 86_400_000 },
		];
		seedSims = [
			{ seedKind: "book", seedId: 99, candKind: "book", candId: 2, score: 1 },
		];
		const result = await service.forUser("u1", "org-a", "ALL", {
			format: "all",
			perMixLimit: 15,
		});
		expect(result.mixes[0]?.items.map((i) => i.book.uuid)).toEqual([
			"top",
			"low",
		]);
	});

	test("inaccessible reason ref degrades to generic reason, never leaks", async () => {
		mixHeaders = [{ mixIndex: 0, anchorTitle: null, hasAnchor: true }];
		mixItems = [row({ reasonTitle: null, reason: "same_author" })];
		const result = await service.forUser("u1", "org-a", "ALL", {
			format: "all",
			perMixLimit: 15,
		});
		const item = result.mixes[0]?.items[0];
		expect(item?.reason.type).toBe("recommended");
		expect(item?.reason.refTitle).toBeNull();
	});
});

describe("popular", () => {
	test("recommendations disabled → enabled:false", async () => {
		orgSettings.set("org-a:recommendations", { enabled: false });
		const result = await service.popular("u1", "org-a", "ALL", {
			format: "all",
			limit: 15,
		});
		expect(result).toEqual({ enabled: false, items: [] });
	});

	test("maps the server popularity ranking to recommendation items", async () => {
		popularRows = [row({ reason: "popular", reasonTitle: null })];
		const result = await service.popular("u1", "org-a", "ALL", {
			format: "books",
			limit: 15,
		});
		expect(result.enabled).toBe(true);
		expect(result.items[0]?.book.uuid).toBe("b-uuid");
		expect(result.items[0]?.reason.type).toBe("popular");
	});
});

describe("similarToBook", () => {
	test("disabled → enabled:false", async () => {
		orgSettings.set("org-a:recommendations", { enabled: false });
		const result = await service.similarToBook("u1", "org-a", "ALL", {
			bookUuid: "b1",
			format: "all",
			limit: 12,
		});
		expect(result).toEqual({ enabled: false, items: [] });
	});

	test("similar titles stay enabled when personalized mixes are disabled", async () => {
		orgSettings.set("org-a:recommendations", {
			enabled: true,
			personalizedEnabled: false,
			similarEnabled: true,
		});
		const result = await service.similarToBook("u1", "org-a", "ALL", {
			bookUuid: "missing",
			format: "all",
			limit: 12,
		});
		expect(result).toEqual({ enabled: true, items: [] });
	});

	test("similar titles can be disabled while personalized mixes stay enabled", async () => {
		orgSettings.set("org-a:recommendations", {
			enabled: true,
			personalizedEnabled: true,
			similarEnabled: false,
		});
		const result = await service.similarToBook("u1", "org-a", "ALL", {
			bookUuid: "b1",
			format: "all",
			limit: 12,
		});
		expect(result).toEqual({ enabled: false, items: [] });
	});

	test("unknown book → empty items without error", async () => {
		resolvedWork = null;
		const result = await service.similarToBook("u1", "org-a", "ALL", {
			bookUuid: "missing",
			format: "all",
			limit: 12,
		});
		expect(result).toEqual({ enabled: true, items: [] });
	});

	test("maps rows to items with series info and reason", async () => {
		resolvedWork = { kind: "series", id: 7 };
		similarRows = [row()];
		const result = await service.similarToBook("u1", "org-a", "ALL", {
			bookUuid: "b1",
			format: "all",
			limit: 12,
		});
		const item = result.items[0];
		expect(item?.seriesName).toBe("Some Series");
		expect(item?.book.uuid).toBe("b-uuid");
		expect(item?.reason.type).toBe("same_author");
		expect(item?.reason.refTitle).toBe("Seed Series");
	});
});

describe("continueSeries", () => {
	test("serves even when recommendations are disabled (deterministic rail)", async () => {
		orgSettings.set("org-a:recommendations", { enabled: false });
		continueSeriesRows = [
			{
				seriesUuid: "s-uuid",
				seriesName: "Some Series",
				nextPosition: "3",
				lastAt: "2026-07-01T00:00:00Z",
				bookUuid: "b-uuid",
				bookTitle: "Vol 3",
				bookFilename: "vol3.epub",
				bookCover: null,
				bookMainColor: null,
				bookMediaType: "ebook",
				authors: null,
			},
		];
		const result = await service.continueSeries("u1", "org-a", "ALL", {
			format: "all",
			limit: 15,
		});
		expect(result.items.length).toBe(1);
	});

	test("maps rows, coercing position to a number and null authors to []", async () => {
		continueSeriesRows = [
			{
				seriesUuid: "s-uuid",
				seriesName: "Some Series",
				nextPosition: "6.5",
				lastAt: "2026-07-01T00:00:00Z",
				bookUuid: "b-uuid",
				bookTitle: "Vol 6.5",
				bookFilename: "vol6.5.epub",
				bookCover: "cover.avif",
				bookMainColor: null,
				bookMediaType: "audiobook",
				authors: null,
			},
		];
		const result = await service.continueSeries("u1", "org-a", "ALL", {
			format: "audiobooks",
			limit: 15,
		});
		const item = result.items[0];
		expect(item?.nextPosition).toBe(6.5);
		expect(item?.book.authors).toEqual([]);
		expect(item?.book.mediaType).toBe("audiobook");
		expect(item?.seriesName).toBe("Some Series");
	});
});
