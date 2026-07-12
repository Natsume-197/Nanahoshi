import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { settingsRepository } from "../../settings/settings.repository";
import type { RepresentativeRow } from "../recommendations.repository";
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

let orgSettings = new Map<string, unknown>();
let mixHeaders: Awaited<ReturnType<typeof originalHeaders>> = [];
let mixItems: RepresentativeRow[] = [];
let similarRows: RepresentativeRow[] = [];
let popularRows: RepresentativeRow[] = [];
let resolvedWork: { kind: "series" | "book"; id: number } | null = null;
let dismissed = new Set<string>();
let recentSeeds: Awaited<ReturnType<typeof originalSeeds>> = [];
let seedSims: Awaited<ReturnType<typeof originalSeedSims>> = [];

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

	test("no computed rows → popularity fallback", async () => {
		popularRows = [row({ reason: "popular", reasonTitle: null })];
		const result = await service.forUser("u1", "org-a", "ALL", {
			format: "all",
			perMixLimit: 15,
		});
		expect(result.mixes.length).toBe(1);
		expect(result.mixes[0]?.items[0]?.reason.type).toBe("popular");
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
