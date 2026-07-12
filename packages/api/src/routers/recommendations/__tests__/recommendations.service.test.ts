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

let orgSettings = new Map<string, unknown>();
let mixHeaders: Awaited<ReturnType<typeof originalHeaders>> = [];
let mixItems: RepresentativeRow[] = [];
let similarRows: RepresentativeRow[] = [];
let popularRows: RepresentativeRow[] = [];
let resolvedWork: { kind: "series" | "book"; id: number } | null = null;

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
		authors: [{ name: "Author" }],
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

	settingsRepository.getOrgValue = (async (serverId: string, key: string) =>
		orgSettings.get(
			`${serverId}:${key}`,
		)) as typeof settingsRepository.getOrgValue;
	recommendationsRepository.listMixHeaders = async () => mixHeaders;
	recommendationsRepository.listMixItems = async () => mixItems;
	recommendationsRepository.listSimilar = async () => similarRows;
	recommendationsRepository.topPopular = async () => popularRows;
	recommendationsRepository.resolveWorkForBook = async () => resolvedWork;
});

afterEach(() => {
	settingsRepository.getOrgValue = originalGetOrgValue;
	recommendationsRepository.listMixHeaders = originalHeaders;
	recommendationsRepository.listMixItems = originalItems;
	recommendationsRepository.listSimilar = originalSimilar;
	recommendationsRepository.topPopular = originalPopular;
	recommendationsRepository.resolveWorkForBook = originalResolveWork;
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
