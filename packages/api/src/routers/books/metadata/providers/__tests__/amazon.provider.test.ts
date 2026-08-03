import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

// ─── Mocks ──────────────────────────────────────────────

const mockGetAmazonConfig = mock(() =>
	Promise.resolve({
		domain: "co.jp",
		cookie: undefined,
		enabled: true,
	}),
);

// Includes every provider-config getter so this mock doesn't break the other
// provider test files sharing the same Bun process.
mock.module("../../../../settings/settings.service", () => ({
	getAmazonConfig: mockGetAmazonConfig,
	getRanobedbConfig: () => Promise.resolve({ enabled: true }),
	getGoogleBooksConfig: () => Promise.resolve({ enabled: true }),
	getOpenLibraryConfig: () => Promise.resolve({ enabled: true }),
	getGoodreadsConfig: () => Promise.resolve({ enabled: true }),
	getComicvineConfig: () =>
		Promise.resolve({ enabled: true, apiKey: "test-key" }),
	getHardcoverConfig: () =>
		Promise.resolve({ enabled: true, apiToken: "test-token" }),
}));

const cheerio = await import("cheerio");
const { amazonProvider } = await import("../amazon.provider");

import { firstMatch } from "./first-match";

// Access private methods for unit testing
const provider = amazonProvider as unknown as Record<
	string,
	(...args: unknown[]) => unknown
>;

// Page/search caches persist across getMetadata calls by design; tests reuse
// URLs and titles with different mocked HTML, so isolate every case.
beforeEach(() => {
	amazonProvider.clearCaches();
});

// ─── cleanSearchTerm ────────────────────────────────────

describe("cleanSearchTerm", () => {
	test("preserves simple titles", () => {
		expect(provider.cleanSearchTerm("俺の妹がこんなに可愛いわけがない")).toBe(
			"俺の妹がこんなに可愛いわけがない",
		);
	});

	test("removes Japanese brackets", () => {
		expect(
			provider.cleanSearchTerm("本好きの下剋上「貴族院の自称図書委員」"),
		).toBe("本好きの下剋上 貴族院の自称図書委員");
	});

	test("removes all bracket types", () => {
		expect(provider.cleanSearchTerm("title【vol1】(extra)")).toBe(
			"title vol1 extra",
		);
		expect(provider.cleanSearchTerm("title『sub』")).toBe("title sub");
		expect(provider.cleanSearchTerm("title（sub）")).toBe("title sub");
	});

	test("removes decorative hyphens from titles like 喰 -kuu-", () => {
		expect(provider.cleanSearchTerm("喰 -kuu-")).toBe("喰 kuu");
	});

	test("removes various dash types", () => {
		expect(provider.cleanSearchTerm("title−sub")).toBe("title sub");
		expect(provider.cleanSearchTerm("title–sub")).toBe("title sub");
		expect(provider.cleanSearchTerm("title—sub")).toBe("title sub");
	});

	test("removes 株式会社 from publisher names", () => {
		expect(provider.cleanSearchTerm("株式会社メディアファクトリー")).toBe(
			"メディアファクトリー",
		);
	});

	test("removes 有限会社 from publisher names", () => {
		expect(provider.cleanSearchTerm("有限会社テスト出版")).toBe("テスト出版");
	});

	test("removes tilde and middle dot", () => {
		expect(
			provider.cleanSearchTerm(
				"本好きの下剋上～司書になるためには手段を選んでいられません～",
			),
		).toBe("本好きの下剋上 司書になるためには手段を選んでいられません");
	});

	test("collapses multiple spaces", () => {
		expect(provider.cleanSearchTerm("a   b    c")).toBe("a b c");
	});
});

// ─── HAS_VOLUME_PATTERN (via inputHasVolume detection) ──

describe("volume detection", () => {
	// We test this by checking what getMetadata would set as inputHasVolume
	// Using the exported HAS_VOLUME_PATTERN regex behavior

	const hasVolume = (title: string) =>
		/[\d０-９]+|(?<![a-zA-Z])[IVXLCivxlc]{2,}(?![a-zA-Z])|第[一二三四五六七八九十百千]+[部巻章編話]/.test(
			title,
		);

	test("detects Arabic digits", () => {
		expect(hasVolume("俺の妹がこんなに可愛いわけがない10")).toBe(true);
		expect(hasVolume("Volume 3")).toBe(true);
	});

	test("detects full-width digits", () => {
		expect(hasVolume("この素晴らしい世界に祝福を！ よりみち４回目！")).toBe(
			true,
		);
		expect(hasVolume("テスト１２３")).toBe(true);
		expect(hasVolume("タイトル０")).toBe(true);
	});

	test("detects Roman numerals (2+ chars)", () => {
		expect(hasVolume("貴族院の自称図書委員IV")).toBe(true);
		expect(hasVolume("Part VII")).toBe(true);
		expect(hasVolume("Chapter XII")).toBe(true);
		expect(hasVolume("Part II")).toBe(true);
	});

	test("does not match single Roman numeral chars in regular words", () => {
		// Single I, V, etc. in normal text should not match
		expect(hasVolume("I am a title")).toBe(false);
		expect(hasVolume("Live and Learn")).toBe(false);
	});

	test("detects kanji part/volume markers", () => {
		expect(hasVolume("第四部「貴族院の自称図書委員」")).toBe(true);
		expect(hasVolume("第一巻")).toBe(true);
		expect(hasVolume("第三章")).toBe(true);
		expect(hasVolume("第十二話")).toBe(true);
		expect(hasVolume("第百編")).toBe(true);
	});

	test("does not match titles without volume indicators", () => {
		expect(hasVolume("俺の妹がこんなに可愛いわけがない")).toBe(false);
		expect(hasVolume("喰 -kuu-")).toBe(false);
		expect(hasVolume("時々ボソッとロシア語でデレる隣のアーリャさん")).toBe(
			false,
		);
	});
});

// ─── normalizeForComparison ─────────────────────────────

describe("normalizeForComparison", () => {
	test("removes non-alphanumeric characters and lowercases", () => {
		expect(provider.normalizeForComparison("Title (Vol.1)")).toBe("titlevol1");
	});

	test("preserves CJK characters", () => {
		expect(provider.normalizeForComparison("俺の妹が")).toBe("俺の妹が");
	});

	test("removes brackets and spaces from JP titles", () => {
		expect(
			provider.normalizeForComparison("タイトル (角川スニーカー文庫)"),
		).toBe("タイトル角川スニーカー文庫");
	});

	test("converts full-width digits to ASCII", () => {
		expect(provider.normalizeForComparison("日誌２")).toBe("日誌2");
		expect(provider.normalizeForComparison("よりみち４回目")).toBe(
			"よりみち4回目",
		);
		expect(provider.normalizeForComparison("１２３")).toBe("123");
	});
});

// ─── isTitleSimilar ─────────────────────────────────────

describe("isTitleSimilar", () => {
	const normalize = (t: string) => provider.normalizeForComparison(t) as string;

	const isSimilar = (a: string, b: string) =>
		provider.isTitleSimilar(normalize(a), normalize(b));

	test("matches when result contains the input", () => {
		expect(
			isSimilar(
				"俺の妹がこんなに可愛いわけがない",
				"俺の妹がこんなに可愛いわけがない (電撃文庫)",
			),
		).toBe(true);
	});

	test("matches when input contains the result", () => {
		expect(
			isSimilar(
				"俺の妹がこんなに可愛いわけがない (電撃文庫)",
				"俺の妹がこんなに可愛いわけがない",
			),
		).toBe(true);
	});

	test("rejects when volume numbers don't match", () => {
		expect(
			isSimilar(
				"俺の妹がこんなに可愛いわけがない10",
				"俺の妹がこんなに可愛いわけがない5",
			),
		).toBe(false);
	});

	test("matches when volume numbers do match", () => {
		expect(
			isSimilar(
				"俺の妹がこんなに可愛いわけがない10",
				"俺の妹がこんなに可愛いわけがない10 (電撃文庫)",
			),
		).toBe(true);
	});

	test("rejects when full-width volume number doesn't match", () => {
		// Input has ２ (vol 2), result has no number (vol 1)
		expect(
			isSimilar(
				"ビブリア古書堂の事件手帖スピンオフ こぐちさんと僕のビブリアファイト部活動日誌２ (電撃文庫)",
				"ビブリア古書堂の事件手帖スピンオフ　こぐちさんと僕のビブリアファイト部活動日誌 (電撃文庫)",
			),
		).toBe(false);
	});

	test("rejects spin-off with different subtitle", () => {
		// 本好きの下剋上 vs 本好きの下剋上 ハンネローレの貴族院五年生
		// These share the series name but are different books
		expect(
			isSimilar(
				"本好きの下剋上～司書になるためには手段を選んでいられません～第四部",
				"本好きの下剋上 ハンネローレの貴族院五年生1",
			),
		).toBe(false);
	});

	test("matches similar titles with high character overlap", () => {
		expect(
			isSimilar(
				"時々ボソッとロシア語でデレる隣のアーリャさん",
				"時々ボソッとロシア語でデレる隣のアーリャさん (角川スニーカー文庫)",
			),
		).toBe(true);
	});

	test("rejects unrelated titles that share only common particles/endings", () => {
		// "社長に求愛されました" shares に, さ, れ, ま, し, た with the result
		// but no meaningful word sequences overlap
		expect(
			isSimilar(
				"社長に求愛されました",
				"かりそめの関係でしたが、独占欲強めな彼の愛妻に指名されました (マカロン文庫)",
			),
		).toBe(false);
	});
});

// ─── Bonus content detection ────────────────────────────

describe("bonus content detection", () => {
	const isBonus = (title: string) => {
		const phrases = [
			"裏話",
			"番外編",
			"書き下ろし",
			"特典",
			"ショートストーリー",
			"短編集",
			"外伝",
			"特別編",
			"side story",
			"bonus",
			"short story collection",
		];
		return phrases.some((p) => title.includes(p));
	};

	test("detects Japanese bonus content markers", () => {
		expect(
			isBonus(
				"『時々ボソッとロシア語でデレる隣のアーリャさん　裏話』BOOK☆WALKER限定書き下ろしショートストーリー",
			),
		).toBe(true);
	});

	test("detects 番外編", () => {
		expect(isBonus("タイトル 番外編")).toBe(true);
	});

	test("detects 外伝", () => {
		expect(isBonus("ソードアート・オンライン 外伝")).toBe(true);
	});

	test("detects English bonus markers", () => {
		expect(isBonus("Title - Side Story")).toBe(false); // case-sensitive
		expect(isBonus("Title - side story")).toBe(true);
		expect(isBonus("Title bonus chapter")).toBe(true);
	});

	test("does not match regular titles", () => {
		expect(isBonus("俺の妹がこんなに可愛いわけがない")).toBe(false);
		expect(isBonus("時々ボソッとロシア語でデレる隣のアーリャさん10")).toBe(
			false,
		);
		expect(isBonus("本好きの下剋上 第四部")).toBe(false);
	});
});

// ─── Box set / compilation detection ────────────────────

describe("box set detection", () => {
	const isBoxSet = (text: string) => {
		const phrases = [
			"books set",
			"box set",
			"collection set",
			"summary & study guide",
			"合本版",
			"合本",
			"全巻セット",
			"まとめ買い",
			"冊セット",
			"全冊収録",
		];
		return (
			phrases.some((p) => text.includes(p)) ||
			text.includes("collects books from")
		);
	};

	test("detects Japanese omnibus markers", () => {
		expect(
			isBoxSet("【合本版】俺の妹がこんなに可愛いわけがない 全12冊収録"),
		).toBe(true);
		expect(isBoxSet("タイトル 合本版")).toBe(true);
		expect(isBoxSet("全巻セット")).toBe(true);
		expect(isBoxSet("まとめ買い")).toBe(true);
	});

	test("detects English box set phrases", () => {
		expect(isBoxSet("Title: The Complete Box Set")).toBe(false); // "Box Set" not "box set"
		expect(isBoxSet("title box set")).toBe(true);
		expect(isBoxSet("books set collection")).toBe(true);
	});

	test("detects 'collects books from'", () => {
		expect(isBoxSet("This collects books from the series")).toBe(true);
	});

	test("does not match regular titles", () => {
		expect(isBoxSet("俺の妹がこんなに可愛いわけがない(1)")).toBe(false);
		expect(isBoxSet("Normal Book Title")).toBe(false);
	});
});

// ─── buildSearchUrl ─────────────────────────────────────

describe("buildSearchUrl", () => {
	test("prioritizes ISBN over title", () => {
		const url = provider.buildSearchUrl(
			{ title: "Some Title", isbn13: "9784049130129" },
			"co.jp",
		);
		expect(url).toContain("9784049130129");
		expect(url).not.toContain("Some+Title");
	});

	test("uses title + author (no publisher)", () => {
		const url = provider.buildSearchUrl(
			{
				title: "タイトル",
				authors: [{ name: "著者名", role: null }],
				publisher: { name: "出版社名" },
			},
			"co.jp",
		);
		expect(url).toContain(encodeURIComponent("タイトル"));
		expect(url).toContain(encodeURIComponent("著者名"));
		expect(url).not.toContain(encodeURIComponent("出版社名"));
	});

	test("returns null when no search data available", () => {
		expect(provider.buildSearchUrl({}, "co.jp")).toBeNull();
	});

	test("restricts to Kindle store", () => {
		const url = provider.buildSearchUrl({ title: "test" }, "co.jp");
		expect(url).toContain("i=digital-text");
	});

	test("uses correct domain", () => {
		const url = provider.buildSearchUrl({ title: "test" }, "com");
		expect(url).toContain("amazon.com/s?k=");
	});

	test("does not include publisher in search query", () => {
		const url = provider.buildSearchUrl(
			{
				title: "喰",
				publisher: { name: "株式会社メディアファクトリー" },
			},
			"co.jp",
		);
		expect(url).not.toContain(encodeURIComponent("メディアファクトリー"));
	});

	test("removes decorative hyphens from title", () => {
		const url = provider.buildSearchUrl({ title: "喰 -kuu-" }, "co.jp");
		// Hyphens replaced by spaces, then trimmed
		expect(url).toContain(encodeURIComponent("喰 kuu"));
	});

	test("URL-encodes the query", () => {
		const url = provider.buildSearchUrl({ title: "日本語タイトル" }, "co.jp");
		expect(url).toContain(encodeURIComponent("日本語タイトル"));
	});

	test("strips an embedded illustrator credit from the author", () => {
		// "ぜんぶ、藍色だった。" — the author field carries the illustrator too;
		// only the primary author (木爾チレン) must reach the query, not 和遥キナ.
		const url = provider.buildSearchUrl(
			{
				title: "ぜんぶ、藍色だった。",
				authors: [{ name: "木爾チレン　イラスト：和遥キナ", role: null }],
			},
			"co.jp",
		);
		expect(url).toContain(encodeURIComponent("木爾チレン"));
		expect(url).not.toContain(encodeURIComponent("和遥キナ"));
		expect(url).not.toContain(encodeURIComponent("イラスト"));
	});

	test("keeps a plain author with no role annotation", () => {
		const url = provider.buildSearchUrl(
			{ title: "タイトル", authors: [{ name: "丸山くがね", role: null }] },
			"co.jp",
		);
		expect(url).toContain(encodeURIComponent("丸山くがね"));
	});
});

// ─── buildSearchUrlVariants ─────────────────────────────

describe("buildSearchUrlVariants", () => {
	const variants = (input: unknown) =>
		provider.buildSearchUrlVariants(input, "co.jp") as string[];

	test("a plain title+author yields title+author then title-only", () => {
		const urls = variants({
			title: "タイトル",
			authors: [{ name: "著者", role: null }],
		});
		expect(urls).toHaveLength(2);
		expect(urls[0]).toContain(encodeURIComponent("タイトル 著者"));
		expect(urls[1]).toContain(encodeURIComponent("タイトル"));
		expect(urls[1]).not.toContain(encodeURIComponent("著者"));
	});

	test("a tagline title adds tagline-stripped tiers, most specific first", () => {
		const urls = variants({
			title:
				"本好きの下剋上 〜司書になるためには手段を選んでいられません〜 ふぁんぶっく10",
			authors: [{ name: "香月　美夜", role: null }],
		});
		// 4 tiers: full, title-only, bare+author, bare-only.
		expect(urls).toHaveLength(4);
		// The first still carries the tagline; a later one drops it.
		expect(urls[0]).toContain(encodeURIComponent("選んでいられません"));
		const bare = urls.find(
			(u) => !u.includes(encodeURIComponent("選んでいられません")),
		);
		expect(bare).toBeDefined();
		expect(bare).toContain(encodeURIComponent("本好きの下剋上 ふぁんぶっく10"));
	});

	test("an ISBN collapses every tier to a single URL", () => {
		const urls = variants({
			title: "タイトル",
			isbn13: "9784049130129",
			authors: [{ name: "著者", role: null }],
		});
		expect(urls).toHaveLength(1);
		expect(urls[0]).toContain("9784049130129");
	});
});

// ─── block-page detection ───────────────────────────────

describe("looksLikeBlockPage", () => {
	const looksBlocked = (html: string) => provider.looksLikeBlockPage(html);

	test("flags the HTTP-200 throttle stub (tiny body)", () => {
		// Shape of the real anti-bot stub: a few KB of CSA tracking, no content.
		const stub = `<!doctype html><html><head><script>csa('Config', {});</script></head><body>${"x".repeat(2000)}</body></html>`;
		expect(looksBlocked(stub)).toBe(true);
	});

	test("flags a small captcha page even though it carries a <title>", () => {
		// Captcha shells are ~10KB *with* a title — size, not the title, is the tell.
		const captcha = `<html><head><title>Amazon.co.jp</title></head><body>${"y".repeat(10000)}</body></html>`;
		expect(captcha.length).toBeLessThan(50000);
		expect(looksBlocked(captcha)).toBe(true);
	});

	test("flags a large page that still carries a captcha marker", () => {
		const captcha = `<html><head><title>Amazon.co.jp</title></head><body>${"y".repeat(60000)} api-services-support@amazon.com</body></html>`;
		expect(looksBlocked(captcha)).toBe(true);
	});

	test("flags the Japanese robot wording", () => {
		const jp = `<html><body>${"z".repeat(500)} ロボットではないことを確認します</body></html>`;
		expect(looksBlocked(jp)).toBe(true);
	});

	test("does not flag a normal (large) page", () => {
		const real = `<html><head><title>Amazon.co.jp</title></head><body><span data-component-type="s-search-results">${"r".repeat(60000)}</span></body></html>`;
		expect(real.length).toBeGreaterThan(50000);
		expect(looksBlocked(real)).toBe(false);
	});
});

// ─── parseBookPage ──────────────────────────────────────

describe("parseBookPage", () => {
	const makeBookPageHtml = (overrides: {
		title?: string;
		authors?: { name: string; role?: string }[];
		description?: string;
		series?: { name: string; label?: string };
		isbn13?: string;
		cover?: string;
	}) => {
		const {
			title = "Test Book",
			authors = [],
			description = "",
			series,
			isbn13 = "",
			cover = "",
		} = overrides;

		const authorsHtml = authors
			.map(
				(a) => `
			<span class="author">
				<a href="#">${a.name}</a>
				${a.role ? `<span class="contribution"><span>(${a.role})</span></span>` : ""}
			</span>`,
			)
			.join("");

		const seriesHtml = series
			? `<div id="rpi-attribute-book_details-series">
				<div class="rpi-attribute-value"><a href="#"><span>${series.name}</span></a></div>
				<div class="rpi-attribute-label"><span>${series.label ?? ""}</span></div>
			</div>`
			: "";

		return `<html><body>
			<span id="productTitle">${title}</span>
			<div id="bylineInfo_feature_div">${authorsHtml}</div>
			<div data-a-expander-name="book_description_expander">
				<div class="a-expander-content">${description}</div>
			</div>
			${seriesHtml}
			${isbn13 ? `<div id="rpi-attribute-book_details-isbn13"><span class="rpi-attribute-value"><span>${isbn13}</span></span></div>` : ""}
			${cover ? `<img id="landingImage" data-old-hires="${cover}" />` : ""}
		</body></html>`;
	};

	test("parses title", () => {
		const $ = cheerio.load(makeBookPageHtml({ title: "テストの本" }));
		const result = provider.parseBookPage($, "B001TEST");
		expect(result.title).toBe("テストの本");
		expect(result.asin).toBe("B001TEST");
	});

	test("splits title with colon into title + subtitle", () => {
		const $ = cheerio.load(
			makeBookPageHtml({ title: "Main Title: Subtitle Here" }),
		);
		const result = provider.parseBookPage($, "B001TEST");
		expect(result.title).toBe("Main Title");
		expect(result.subtitle).toBe("Subtitle Here");
	});

	test("parses authors with roles", () => {
		const $ = cheerio.load(
			makeBookPageHtml({
				authors: [
					{ name: "著者A", role: "著" },
					{ name: "著者B", role: "イラスト" },
				],
			}),
		);
		const result = provider.parseBookPage($, "B001TEST");
		expect(result.authors).toHaveLength(2);
		expect(result.authors[0]).toEqual({ name: "著者A", role: "著" });
		expect(result.authors[1]).toEqual({ name: "著者B", role: "イラスト" });
	});

	test("parses description as plain text", () => {
		const $ = cheerio.load(
			makeBookPageHtml({
				description: "Line one<br>Line two<span>text</span>",
			}),
		);
		const result = provider.parseBookPage($, "B001TEST");
		expect(result.description).toContain("Line one");
		expect(result.description).toContain("Line two");
		expect(result.description).not.toContain("<span>");
	});

	test("parses series name and position (English format)", () => {
		const $ = cheerio.load(
			makeBookPageHtml({
				series: { name: "My Series", label: "Book 3 of 10" },
			}),
		);
		const result = provider.parseBookPage($, "B001TEST");
		expect(result.series).toEqual({ name: "My Series", position: 3 });
	});

	test("parses series position (JP format 全X冊中Y番目)", () => {
		const $ = cheerio.load(
			makeBookPageHtml({
				series: {
					name: "俺の妹がこんなに可愛いわけがない",
					label: "全13冊中3番目の本",
				},
			}),
		);
		const result = provider.parseBookPage($, "B001TEST");
		expect(result.series?.position).toBe(3);
	});

	test("parses ISBN-13", () => {
		const $ = cheerio.load(makeBookPageHtml({ isbn13: "978-4-04-913012-9" }));
		const result = provider.parseBookPage($, "B001TEST");
		expect(result.isbn13).toBe("978-4-04-913012-9");
	});

	test("parses cover URL", () => {
		const $ = cheerio.load(
			makeBookPageHtml({ cover: "https://images.amazon.com/cover.jpg" }),
		);
		const result = provider.parseBookPage($, "B001TEST");
		expect(result.cover).toBe("https://images.amazon.com/cover.jpg");
	});
});

// ─── searchForAsin (with mocked HTML) ───────────────────

describe("searchForAsin", () => {
	const makeSearchResultHtml = (
		items: { asin: string; title: string; extraText?: string }[],
	) => {
		const itemsHtml = items
			.map(
				(item) => `
			<div data-asin="${item.asin}">
				<div data-cy="title-recipe">
					<h2>${item.title}</h2>
				</div>
				${item.extraText ?? ""}
			</div>`,
			)
			.join("");

		return `<html><body>
			<span data-component-type="s-search-results">
				${itemsHtml}
			</span>
		</body></html>`;
	};

	const config = { domain: "co.jp", enabled: true } as {
		domain: string;
		enabled: boolean;
		cookie?: string;
	};

	// Helper: mock fetchPage to return our HTML
	const withSearchResults = (
		items: { asin: string; title: string; extraText?: string }[],
	) => {
		const html = makeSearchResultHtml(items);
		const $ = cheerio.load(html);
		const original = provider.fetchPage;
		provider.fetchPage = mock(() => Promise.resolve($));
		return () => {
			provider.fetchPage = original;
		};
	};

	test("filters out box sets (合本版)", () => {
		const restore = withSearchResults([
			{
				asin: "B001BOXSET",
				title: "【合本版】タイトル",
				extraText: "<span>合本版</span>",
			},
			{ asin: "B002REAL", title: "タイトル (文庫)" },
		]);

		const result = provider.searchForAsin(
			"https://amazon.co.jp/s?k=test",
			config,
			"タイトル",
			true,
			false,
		);

		return (result as Promise<string | null>).then((asin) => {
			expect(asin).toBe("B002REAL");
			restore();
		});
	});

	test("filters out bonus content when input is regular and has no volume", () => {
		const restore = withSearchResults([
			{ asin: "B001BONUS", title: "タイトル 裏話 ショートストーリー" },
			{ asin: "B002REAL", title: "タイトル (文庫)" },
		]);

		const result = provider.searchForAsin(
			"https://amazon.co.jp/s?k=test",
			config,
			"タイトル",
			false, // no volume
			false, // not bonus
		);

		return (result as Promise<string | null>).then((asin) => {
			expect(asin).toBe("B002REAL");
			restore();
		});
	});

	test("when input is bonus, only matches bonus results", () => {
		const restore = withSearchResults([
			{ asin: "B001REG", title: "タイトル (文庫)" },
			{ asin: "B002BONUS", title: "タイトル 裏話" },
		]);

		const result = provider.searchForAsin(
			"https://amazon.co.jp/s?k=test",
			config,
			"タイトル 裏話",
			false, // no volume
			true, // is bonus
		);

		return (result as Promise<string | null>).then((asin) => {
			expect(asin).toBe("B002BONUS");
			restore();
		});
	});

	test("when input is bonus and no bonus results exist, returns null", () => {
		const restore = withSearchResults([
			{ asin: "B001REG", title: "タイトル (文庫)" },
			{ asin: "B002REG2", title: "タイトル2 (文庫)" },
		]);

		const result = provider.searchForAsin(
			"https://amazon.co.jp/s?k=test",
			config,
			"タイトル 裏話",
			false,
			true,
		);

		return (result as Promise<string | null>).then((asin) => {
			expect(asin).toBeNull();
			restore();
		});
	});

	test("with volume number, returns first valid match immediately", () => {
		const restore = withSearchResults([
			{ asin: "B001FIRST", title: "タイトル10 (文庫)" },
			{ asin: "B002SECOND", title: "タイトル10 (別版)" },
		]);

		const result = provider.searchForAsin(
			"https://amazon.co.jp/s?k=test",
			config,
			"タイトル10",
			true, // has volume
			false,
		);

		return (result as Promise<string | null>).then((asin) => {
			expect(asin).toBe("B001FIRST");
			restore();
		});
	});

	test("without volume, prefers title closest in length to input", () => {
		const restore = withSearchResults([
			{ asin: "B001LONG", title: "タイトル ももこ画集 extra text here" },
			{ asin: "B002SHORT", title: "タイトル (文庫)" },
			{ asin: "B003MED", title: "タイトル2 (文庫)" },
		]);

		const result = provider.searchForAsin(
			"https://amazon.co.jp/s?k=test",
			config,
			"タイトル",
			false, // no volume
			false,
		);

		return (result as Promise<string | null>).then((asin) => {
			// B002SHORT should be closest in length to "タイトル"
			expect(asin).toBe("B002SHORT");
			restore();
		});
	});

	test("skips items with empty ASIN", () => {
		const restore = withSearchResults([
			{ asin: "", title: "Empty ASIN" },
			{ asin: "B001REAL", title: "タイトル" },
		]);

		const result = provider.searchForAsin(
			"https://amazon.co.jp/s?k=test",
			config,
			"タイトル",
			true,
			false,
		);

		return (result as Promise<string | null>).then((asin) => {
			expect(asin).toBe("B001REAL");
			restore();
		});
	});

	test("rejects results that fail title similarity", () => {
		const restore = withSearchResults([
			{ asin: "B001WRONG", title: "完全に違うタイトル" },
		]);

		const result = provider.searchForAsin(
			"https://amazon.co.jp/s?k=test",
			config,
			"俺の妹がこんなに可愛いわけがない",
			true,
			false,
		);

		return (result as Promise<string | null>).then((asin) => {
			expect(asin).toBeNull();
			restore();
		});
	});
});

// ─── Real-world search scenarios ────────────────────────
// These reproduce actual Amazon search results that caused bugs

describe("real-world: 俺の妹がこんなに可愛いわけがない (no volume → must find vol 1, not 合本版 or later vol)", () => {
	const makeSearchResultHtml = (
		items: { asin: string; title: string; extraText?: string }[],
	) => {
		const itemsHtml = items
			.map(
				(item) => `
			<div data-asin="${item.asin}">
				<div data-cy="title-recipe">
					<h2>${item.title}</h2>
				</div>
				${item.extraText ?? ""}
			</div>`,
			)
			.join("");
		return `<html><body>
			<span data-component-type="s-search-results">${itemsHtml}</span>
		</body></html>`;
	};

	const config = { domain: "co.jp", enabled: true } as {
		domain: string;
		enabled: boolean;
		cookie?: string;
	};

	test("filters 合本版 and prefers vol 1 (shortest title) over later volumes", async () => {
		const html = makeSearchResultHtml([
			{
				asin: "BOXSET01",
				title: "【合本版】俺の妹がこんなに可愛いわけがない 全12冊収録",
				extraText: "<span>合本版 全冊収録</span>",
			},
			{
				asin: "VOL13",
				title: "俺の妹がこんなに可愛いわけがない(13) (電撃文庫)",
			},
			{
				asin: "VOL12",
				title: "俺の妹がこんなに可愛いわけがない(12) (電撃文庫)",
			},
			{
				asin: "VOL01",
				title: "俺の妹がこんなに可愛いわけがない (電撃文庫)",
			},
			{
				asin: "VOL02",
				title: "俺の妹がこんなに可愛いわけがない(2) (電撃文庫)",
			},
		]);

		const $ = cheerio.load(html);
		const original = provider.fetchPage;
		provider.fetchPage = mock(() => Promise.resolve($));

		const asin = await provider.searchForAsin(
			"https://amazon.co.jp/s?k=test",
			config,
			"俺の妹がこんなに可愛いわけがない",
			false, // no volume in input
			false,
		);

		// 合本版 should be filtered, VOL01 (shortest) should win
		expect(asin).toBe("VOL01");
		provider.fetchPage = original;
	});
});

describe("real-world: 時々ボソッとロシア語でデレる隣のアーリャさん (no volume → LN vol 1 over manga/art book)", () => {
	const makeSearchResultHtml = (items: { asin: string; title: string }[]) => {
		const itemsHtml = items
			.map(
				(item) => `
			<div data-asin="${item.asin}">
				<div data-cy="title-recipe">
					<h2>${item.title}</h2>
				</div>
			</div>`,
			)
			.join("");
		return `<html><body>
			<span data-component-type="s-search-results">${itemsHtml}</span>
		</body></html>`;
	};

	const config = { domain: "co.jp", enabled: true } as {
		domain: string;
		enabled: boolean;
		cookie?: string;
	};

	test("prefers LN vol 1 (closest title length) over art book and manga", async () => {
		const html = makeSearchResultHtml([
			{
				asin: "ARTBOOK",
				title: "時々ボソッとロシア語でデレる隣のアーリャさん　ももこ画集",
			},
			{
				asin: "MANGA1",
				title:
					"時々ボソッとロシア語でデレる隣のアーリャさん（１） (マガジンポケットコミックス)",
			},
			{
				asin: "LN_VOL1",
				title:
					"時々ボソッとロシア語でデレる隣のアーリャさん (角川スニーカー文庫)",
			},
			{
				asin: "LN_VOL2",
				title:
					"時々ボソッとロシア語でデレる隣のアーリャさん2 (角川スニーカー文庫)",
			},
		]);

		const $ = cheerio.load(html);
		const original = provider.fetchPage;
		provider.fetchPage = mock(() => Promise.resolve($));

		const asin = await provider.searchForAsin(
			"https://amazon.co.jp/s?k=test",
			config,
			"時々ボソッとロシア語でデレる隣のアーリャさん",
			false, // no volume
			false,
		);

		// LN_VOL1 title is closest in length to input (no extra number/imprint)
		expect(asin).toBe("LN_VOL1");
		provider.fetchPage = original;
	});
});

describe("real-world: bonus story should not match regular volumes", () => {
	const makeSearchResultHtml = (items: { asin: string; title: string }[]) => {
		const itemsHtml = items
			.map(
				(item) => `
			<div data-asin="${item.asin}">
				<div data-cy="title-recipe">
					<h2>${item.title}</h2>
				</div>
			</div>`,
			)
			.join("");
		return `<html><body>
			<span data-component-type="s-search-results">${itemsHtml}</span>
		</body></html>`;
	};

	const config = { domain: "co.jp", enabled: true } as {
		domain: string;
		enabled: boolean;
		cookie?: string;
	};

	test("bonus input only matches bonus results, returns null if none exist", async () => {
		const html = makeSearchResultHtml([
			{
				asin: "MANGA8",
				title:
					"時々ボソッとロシア語でデレる隣のアーリャさん（８） (マガジンポケットコミックス)",
			},
			{
				asin: "LN_VOL1",
				title:
					"時々ボソッとロシア語でデレる隣のアーリャさん (角川スニーカー文庫)",
			},
			{
				asin: "LN_VOL2",
				title:
					"時々ボソッとロシア語でデレる隣のアーリャさん2 (角川スニーカー文庫)",
			},
		]);

		const $ = cheerio.load(html);
		const original = provider.fetchPage;
		provider.fetchPage = mock(() => Promise.resolve($));

		const asin = await provider.searchForAsin(
			"https://amazon.co.jp/s?k=test",
			config,
			"『時々ボソッとロシア語でデレる隣のアーリャさん　裏話』BOOK☆WALKER限定書き下ろしショートストーリー",
			false,
			true, // input IS bonus
		);

		// No bonus results in search → should return null
		expect(asin).toBeNull();
		provider.fetchPage = original;
	});

	test("bonus input matches if Amazon has the bonus content", async () => {
		const html = makeSearchResultHtml([
			{
				asin: "LN_VOL1",
				title:
					"時々ボソッとロシア語でデレる隣のアーリャさん (角川スニーカー文庫)",
			},
			{
				asin: "BONUS_MATCH",
				title: "時々ボソッとロシア語でデレる隣のアーリャさん 裏話 特別編",
			},
		]);

		const $ = cheerio.load(html);
		const original = provider.fetchPage;
		provider.fetchPage = mock(() => Promise.resolve($));

		const asin = await provider.searchForAsin(
			"https://amazon.co.jp/s?k=test",
			config,
			"時々ボソッとロシア語でデレる隣のアーリャさん 裏話",
			false,
			true, // input IS bonus
		);

		// Should match the bonus result, skipping the regular volume
		expect(asin).toBe("BONUS_MATCH");
		provider.fetchPage = original;
	});
});

describe("real-world: 本好きの下剋上 第四部 (has kanji volume → no vol 1 redirect)", () => {
	test("第四部 is detected as having a volume indicator", () => {
		const hasVolume =
			/\d+|(?<![a-zA-Z])[IVXLCivxlc]{2,}(?![a-zA-Z])|第[一二三四五六七八九十百千]+[部巻章編話]/.test(
				"本好きの下剋上～司書になるためには手段を選んでいられません～第四部「貴族院の自称図書委員IV」",
			);
		expect(hasVolume).toBe(true);
	});

	test("IV is detected as Roman numeral volume", () => {
		const hasVolume =
			/\d+|(?<![a-zA-Z])[IVXLCivxlc]{2,}(?![a-zA-Z])|第[一二三四五六七八九十百千]+[部巻章編話]/.test(
				"貴族院の自称図書委員IV",
			);
		expect(hasVolume).toBe(true);
	});
});

describe("real-world: 喰 -kuu- (hyphens in title → proper search query)", () => {
	test("search URL removes decorative hyphens and encodes properly", () => {
		const url = provider.buildSearchUrl(
			{
				title: "喰 -kuu-",
				authors: [{ name: "内田 俊", role: null }],
				publisher: { name: "株式会社メディアファクトリー" },
			},
			"co.jp",
		);

		// Should contain the title without hyphens
		expect(url).toContain(encodeURIComponent("喰 kuu"));
		// Should contain author
		expect(url).toContain(encodeURIComponent("内田 俊"));
		// Should NOT include publisher (pollutes search results)
		expect(url).not.toContain(encodeURIComponent("メディアファクトリー"));
		// Should be in Kindle store
		expect(url).toContain("i=digital-text");
	});
});

describe("real-world: この素晴らしい世界に祝福を！ よりみち４回目！ (full-width digits + series card filtering)", () => {
	const makeSearchResultHtml = (
		items: { asin: string; title: string; extraText?: string }[],
	) => {
		const itemsHtml = items
			.map(
				(item) => `
			<div data-asin="${item.asin}">
				<div data-cy="title-recipe">
					<h2>${item.title}</h2>
				</div>
				${item.extraText ?? ""}
			</div>`,
			)
			.join("");
		return `<html><body>
			<span data-component-type="s-search-results">${itemsHtml}</span>
		</body></html>`;
	};

	const config = { domain: "co.jp", enabled: true } as {
		domain: string;
		enabled: boolean;
		cookie?: string;
	};

	test("full-width ４ is detected as a volume number", () => {
		const hasVolume =
			/[\d０-９]+|(?<![a-zA-Z])[IVXLCivxlc]{2,}(?![a-zA-Z])|第[一二三四五六七八九十百千]+[部巻章編話]/.test(
				"この素晴らしい世界に祝福を！ よりみち４回目！",
			);
		expect(hasVolume).toBe(true);
	});

	test("filters series cards and returns individual book", async () => {
		const html = makeSearchResultHtml([
			{
				asin: "B07572LT5X",
				title: "この素晴らしい世界に祝福を！",
				extraText: "<span>17巻のシリーズ</span>",
			},
			{
				asin: "B00INDIVIDUAL",
				title:
					"この素晴らしい世界に祝福を！ よりみち４回目！ (角川スニーカー文庫)",
			},
		]);

		const $ = cheerio.load(html);
		const original = provider.fetchPage;
		provider.fetchPage = mock(() => Promise.resolve($));

		const asin = await (
			provider.searchForAsin as (
				url: string,
				config: unknown,
				title: string,
				hasVol: boolean,
				isBonus: boolean,
			) => Promise<string | null>
		)(
			"https://amazon.co.jp/s?k=test",
			config,
			"この素晴らしい世界に祝福を！ よりみち４回目！",
			true, // has volume (full-width ４)
			false,
		);

		expect(asin).toBe("B00INDIVIDUAL");
		provider.fetchPage = original;
	});
});

describe("real-world: この素晴らしい世界に祝福を！エクストラ (no volume → exact title match over shorter similar title)", () => {
	const makeSearchResultHtml = (
		items: { asin: string; title: string; extraText?: string }[],
	) => {
		const itemsHtml = items
			.map(
				(item) => `
			<div data-asin="${item.asin}">
				<div data-cy="title-recipe">
					<h2>${item.title}</h2>
				</div>
				${item.extraText ?? ""}
			</div>`,
			)
			.join("");
		return `<html><body>
			<span data-component-type="s-search-results">${itemsHtml}</span>
		</body></html>`;
	};

	const config = { domain: "co.jp", enabled: true } as {
		domain: string;
		enabled: boolean;
		cookie?: string;
	};

	test("prefers candidate containing full input title over closer-length partial match", async () => {
		// Reproduces: input "もっとあの愚か者にも脚光を！　姫様からの招待状" lost to vol 5
		// because vol 5 title was closer in length, even though correct book contains full input
		const html = makeSearchResultHtml([
			{
				asin: "B07VRM696Y",
				title:
					"この素晴らしい世界に祝福を！エクストラ　あの愚か者にも脚光を！5　白き竜との盟約 (角川スニーカー文庫)",
			},
			{
				asin: "B0GMYH2T6K",
				title:
					"この素晴らしい世界に祝福を！エクストラ　もっとあの愚か者にも脚光を！　姫様からの招待状 (角川スニーカー文庫)",
			},
			{
				asin: "B07572LT5X",
				title: "この素晴らしい世界に祝福を！",
			},
		]);

		const $ = cheerio.load(html);
		const original = provider.fetchPage;
		provider.fetchPage = mock(() => Promise.resolve($));

		const asin = await (
			provider.searchForAsin as (
				url: string,
				config: unknown,
				title: string,
				hasVol: boolean,
				isBonus: boolean,
			) => Promise<string | null>
		)(
			"https://amazon.co.jp/s?k=test",
			config,
			"この素晴らしい世界に祝福を！エクストラ　もっとあの愚か者にも脚光を！　姫様からの招待状",
			false, // no volume number
			false,
		);

		// B0GMYH2T6K contains the full input title, should rank first
		expect(asin).toBe("B0GMYH2T6K");
		provider.fetchPage = original;
	});
});

// ─── getMetadata integration ────────────────────────────

describe("parseRating / parseReviewCount", () => {
	test("reads rating + count from acrPopover without the feature_div wrapper", () => {
		// Real B07JCPHG84 layout: no averageCustomerReviews_feature_div, and the
		// inner a-size-base spans hold unrelated numbers — the title is the source.
		const $ = cheerio.load(`
			<span id="acrPopover" title="5つ星のうち4.5">
				<span class="a-size-base a-color-base">6</span>
			</span>
			<span id="acrCustomerReviewText" class="a-size-small">(176)</span>
		`);
		expect(provider.parseRating($)).toBe(4.5);
		expect(provider.parseReviewCount($)).toBe(176);
	});

	test("handles English 'out of 5' phrasing", () => {
		const $ = cheerio.load(
			`<span id="acrPopover" title="4.3 out of 5 stars"></span>`,
		);
		expect(provider.parseRating($)).toBe(4.3);
	});

	test("returns null when there is no rating", () => {
		const $ = cheerio.load("<div></div>");
		expect(provider.parseRating($)).toBeNull();
		expect(provider.parseReviewCount($)).toBeNull();
	});
});

describe("getMetadata", () => {
	test("returns empty when provider is disabled", async () => {
		mockGetAmazonConfig.mockImplementation(() =>
			Promise.resolve({ domain: "co.jp", enabled: false }),
		);

		const { metadata: result } = await firstMatch(amazonProvider, {
			title: "Test",
			bookId: 1,
			uuid: "test-uuid",
			serverId: "org-disabled",
		});

		expect(result).toEqual({});

		// Restore — and clear the per-org config cache so the disabled config
		// doesn't leak into later tests in this file.
		mockGetAmazonConfig.mockImplementation(() =>
			Promise.resolve({ domain: "co.jp", enabled: true }),
		);
		(provider.configCache as Map<string, unknown>).clear();
	});

	test("returns empty when no search data available", async () => {
		const { metadata: result } = await firstMatch(amazonProvider, {
			bookId: 1,
			uuid: "test-uuid",
		});

		expect(result).toEqual({});
	});

	test("falls through a series/landing dud page to the next real book", async () => {
		// Reproduces the live 「美人でお金持ちの彼女が欲しい」… case: the top hit
		// (B0C1YHBDRQ, exact title) is a series landing page with no #productTitle,
		// so the real book (B09VRZVZBT) must be used instead of bailing with {}.
		const TITLE =
			"「美人でお金持ちの彼女が欲しい」と言ったら、ワケあり女子がやってきた件。";
		const searchHtml = `<html><body><span data-component-type="s-search-results">
			<div data-asin="B0C1YHBDRQ"><div data-cy="title-recipe"><h2>${TITLE}</h2></div></div>
			<div data-asin="B09VRZVZBT"><div data-cy="title-recipe"><h2>${TITLE} (GCN文庫)</h2></div></div>
		</span></body></html>`;
		const dudHtml = `<html><body><div id="seriesLanding">no product title</div></body></html>`;
		const bookHtml = `<html><body><span id="productTitle">${TITLE}</span></body></html>`;

		const original = provider.fetchPage;
		provider.fetchPage = mock((url: unknown) => {
			const u = String(url);
			if (u.includes("/s?k=")) return Promise.resolve(cheerio.load(searchHtml));
			if (u.includes("/dp/B0C1YHBDRQ"))
				return Promise.resolve(cheerio.load(dudHtml));
			if (u.includes("/dp/B09VRZVZBT"))
				return Promise.resolve(cheerio.load(bookHtml));
			return Promise.resolve(null);
		});

		// Both ASINs are offered, in search order. Hydrating the landing page
		// yields null, which is the pipeline's signal to try the next candidate.
		const input = {
			title: TITLE,
			authors: [{ name: "Re岳", role: null }],
			bookId: 1,
			uuid: "u",
		};
		const candidates = await amazonProvider.discoverCandidates(input);
		expect(candidates.map((c) => c.providerId)).toEqual([
			"B0C1YHBDRQ",
			"B09VRZVZBT",
		]);
		const [dud, book] = candidates;
		if (!dud || !book) throw new Error("expected both candidates");
		expect(await amazonProvider.hydrateCandidate(dud, input)).toBe(null);
		const real = await amazonProvider.hydrateCandidate(book, input);
		expect(real?.metadata.asin).toBe("B09VRZVZBT");
		expect(real?.metadata.title).toBe(TITLE);
		provider.fetchPage = original;
	});

	test("retries with title alone when the author over-narrows to zero hits", async () => {
		// A pen-name mismatch makes the title+author query return an empty
		// results container; the title-only fallback must still find the book.
		const TITLE = "ぜんぶ、藍色だった。";
		const AUTHOR = "ペンネーム不一致";
		const emptyHtml = `<html><body><span data-component-type="s-search-results"></span></body></html>`;
		const titleHitHtml = `<html><body><span data-component-type="s-search-results">
			<div data-asin="B097GZR6L6"><div data-cy="title-recipe"><h2>${TITLE}</h2></div></div>
		</span></body></html>`;
		const bookHtml = `<html><body><span id="productTitle">${TITLE}</span></body></html>`;

		const original = provider.fetchPage;
		provider.fetchPage = mock((url: unknown) => {
			const u = String(url);
			if (u.includes("/s?k=")) {
				// Author-qualified query → no results; title-only → the hit.
				return Promise.resolve(
					cheerio.load(
						u.includes(encodeURIComponent(AUTHOR)) ? emptyHtml : titleHitHtml,
					),
				);
			}
			if (u.includes("/dp/B097GZR6L6"))
				return Promise.resolve(cheerio.load(bookHtml));
			return Promise.resolve(null);
		});

		const { metadata: result } = await firstMatch(amazonProvider, {
			title: TITLE,
			authors: [{ name: AUTHOR, role: null }],
			bookId: 1,
			uuid: "u",
		});

		expect(result.asin).toBe("B097GZR6L6");
		provider.fetchPage = original;
	});

	test("picks the matching series sibling, not a same-length wrong volume", async () => {
		// Reproduces 青春ブタ野郎はプチデビル後輩…: the box set (全2巻) has no
		// #productTitle, and a same-length sibling (ハツコイ少女) is also returned.
		// Ranking by content (not length) must land on プチデビル後輩 (B00NIG0PBW).
		const INPUT = "青春ブタ野郎はプチデビル後輩の夢を見ない (電撃文庫)";
		const RIGHT =
			"青春ブタ野郎はプチデビル後輩の夢を見ない 『青春ブタ野郎』シリーズ (電撃文庫)";
		const WRONG =
			"青春ブタ野郎はハツコイ少女の夢を見ない 『青春ブタ野郎』シリーズ (電撃文庫)";
		const searchHtml = `<html><body><span data-component-type="s-search-results">
			<div data-asin="B07PFG2BGP"><div data-cy="title-recipe"><h2>青春ブタ野郎はプチデビル後輩の夢を見ない (全2巻)</h2></div></div>
			<div data-asin="B01MDTF86H"><div data-cy="title-recipe"><h2>${WRONG}</h2></div></div>
			<div data-asin="B00NIG0PBW"><div data-cy="title-recipe"><h2>${RIGHT}</h2></div></div>
		</span></body></html>`;
		const boxSetHtml = `<html><body><div id="noProductTitleHere"></div></body></html>`;
		const wrongHtml = `<html><body><span id="productTitle">${WRONG}</span></body></html>`;
		const rightHtml = `<html><body><span id="productTitle">${RIGHT}</span></body></html>`;

		const original = provider.fetchPage;
		provider.fetchPage = mock((url: unknown) => {
			const u = String(url);
			if (u.includes("/s?k=")) return Promise.resolve(cheerio.load(searchHtml));
			if (u.includes("/dp/B07PFG2BGP"))
				return Promise.resolve(cheerio.load(boxSetHtml));
			if (u.includes("/dp/B01MDTF86H"))
				return Promise.resolve(cheerio.load(wrongHtml));
			if (u.includes("/dp/B00NIG0PBW"))
				return Promise.resolve(cheerio.load(rightHtml));
			return Promise.resolve(null);
		});

		const { metadata: result } = await firstMatch(amazonProvider, {
			title: INPUT,
			authors: [{ name: "鴨志田 一", role: null }],
			bookId: 1,
			uuid: "u",
		});

		expect(result.asin).toBe("B00NIG0PBW");
		provider.fetchPage = original;
	});

	test("matches a fanbook whose listing drops the tagline but adds an imprint", async () => {
		// 本好きの下剋上 ふぁんぶっく８: the input carries the series tagline
		// (〜司書になるためには…〜) while Amazon's listing drops it and adds an
		// imprint (TOブックスラノベ). Stripping the imprint for comparison keeps the
		// bigram ratio above threshold so B0CGWQNPGC is found.
		const INPUT =
			"本好きの下剋上 〜司書になるためには手段を選んでいられません〜 ふぁんぶっく８";
		const LISTING = "本好きの下剋上ふぁんぶっく8 (TOブックスラノベ)";
		const searchHtml = `<html><body><span data-component-type="s-search-results">
			<div data-asin="B0CGWQNPGC"><div data-cy="title-recipe"><h2>${LISTING}</h2></div></div>
		</span></body></html>`;
		const bookHtml = `<html><body><span id="productTitle">${LISTING}</span></body></html>`;

		const original = provider.fetchPage;
		provider.fetchPage = mock((url: unknown) => {
			const u = String(url);
			if (u.includes("/s?k=")) return Promise.resolve(cheerio.load(searchHtml));
			if (u.includes("/dp/B0CGWQNPGC"))
				return Promise.resolve(cheerio.load(bookHtml));
			return Promise.resolve(null);
		});

		const { metadata: result } = await firstMatch(amazonProvider, {
			title: INPUT,
			authors: [{ name: "香月　美夜", role: null }],
			bookId: 1,
			uuid: "u",
		});

		expect(result.asin).toBe("B0CGWQNPGC");
		provider.fetchPage = original;
	});

	test("does not turn an unnumbered fanbook into main-series volume 1", async () => {
		const INPUT =
			"本好きの下剋上 〜司書になるためには手段を選んでいられません〜 ふぁんぶっく";
		const regularTitle =
			"本好きの下剋上～司書になるためには手段を選んでいられません～第一部「兵士の娘I」";
		const searchHtml = `<html><body><span data-component-type="s-search-results">
			<div data-asin="B00TKIAMYW"><div data-cy="title-recipe"><h2>${regularTitle}</h2></div></div>
		</span></body></html>`;

		const original = provider.fetchPage;
		provider.fetchPage = mock((url: unknown) => {
			if (String(url).includes("/s?k=")) {
				return Promise.resolve(cheerio.load(searchHtml));
			}
			return Promise.resolve(null);
		});

		const { metadata: result } = await firstMatch(amazonProvider, {
			title: INPUT,
			authors: [{ name: "香月　美夜", role: null }],
			bookId: 1,
			uuid: "u",
		});

		expect(result).toEqual({});
		provider.fetchPage = original;
	});

	test("relaxes the query past the series tagline when it buries the book", async () => {
		// 本好きの下剋上 ふぁんぶっく10: the tagline query returns only the regular
		// series volumes (no fanbook); dropping the tagline surfaces B0FQHVMZSN.
		const INPUT =
			"本好きの下剋上 〜司書になるためには手段を選んでいられません〜 ふぁんぶっく10";
		const LISTING = "本好きの下剋上ふぁんぶっく10 (TOブックスラノベ)";
		const taglineHtml = `<html><body><span data-component-type="s-search-results">
			<div data-asin="B09XDJF283"><div data-cy="title-recipe"><h2>本好きの下剋上～司書になるためには手段を選んでいられません～第五部「女神の化身IX」</h2></div></div>
		</span></body></html>`;
		const bareHtml = `<html><body><span data-component-type="s-search-results">
			<div data-asin="B0FQHVMZSN"><div data-cy="title-recipe"><h2>${LISTING}</h2></div></div>
		</span></body></html>`;
		const bookHtml = `<html><body><span id="productTitle">${LISTING}</span></body></html>`;

		const original = provider.fetchPage;
		provider.fetchPage = mock((url: unknown) => {
			const u = String(url);
			if (u.includes("/s?k=")) {
				// Tagline still present → only the regular volume (filtered out).
				const taglined = u.includes(encodeURIComponent("選んでいられません"));
				return Promise.resolve(cheerio.load(taglined ? taglineHtml : bareHtml));
			}
			if (u.includes("/dp/B0FQHVMZSN"))
				return Promise.resolve(cheerio.load(bookHtml));
			return Promise.resolve(null);
		});

		const { metadata: result } = await firstMatch(amazonProvider, {
			title: INPUT,
			authors: [{ name: "香月　美夜", role: null }],
			bookId: 1,
			uuid: "u",
		});

		expect(result.asin).toBe("B0FQHVMZSN");
		provider.fetchPage = original;
	});
});

// ─── isBareSeriesTitle (vol-1 redirect gate) ────────────
// Guards the vol-1 redirect: it must only fire for bare series titles, never
// for subtitle-distinguished volumes (which Amazon would otherwise collapse
// onto vol 1's ASIN — the 涼宮ハルヒ / 青春ブタ野郎 false-link bug).

describe("isBareSeriesTitle", () => {
	const bare = (input: string, series: string) =>
		provider.isBareSeriesTitle(input, series) as boolean;

	test("bare series title (input == series name) → redirect allowed", () => {
		expect(
			bare(
				"俺の妹がこんなに可愛いわけがない",
				"俺の妹がこんなに可愛いわけがない",
			),
		).toBe(true);
	});

	test("input shorter than Amazon's series name still redirects", () => {
		// Amazon sometimes reports a longer canonical series name than the EPUB
		expect(bare("涼宮ハルヒ", "涼宮ハルヒシリーズ")).toBe(true);
	});

	test("subtitle-distinguished volume → redirect blocked", () => {
		expect(bare("涼宮ハルヒの劇場", "涼宮ハルヒ")).toBe(false);
		expect(bare("涼宮ハルヒの消失", "涼宮ハルヒ")).toBe(false);
		expect(
			bare("青春ブタ野郎はおでかけシスターの夢を見ない", "青春ブタ野郎"),
		).toBe(false);
	});

	test("empty / missing series name → blocked (conservative)", () => {
		expect(bare("涼宮ハルヒの劇場", "")).toBe(false);
	});
});

// ─── searchForAsin: part-marker conflict filter ─────────
// A 劇場版 movie "上" must not match a same-franchise novel "前編", even though
// they share the STEINS;GATE prefix (the wrong-ASIN bug the user hit).

describe("real-world: 劇場版 STEINS;GATE 上 must not match novel 前編", () => {
	const makeSearchResultHtml = (items: { asin: string; title: string }[]) =>
		`<html><body><span data-component-type="s-search-results">${items
			.map(
				(item) => `<div data-asin="${item.asin}">
					<div data-cy="title-recipe"><h2>${item.title}</h2></div>
				</div>`,
			)
			.join("")}</span></body></html>`;

	const config = { domain: "co.jp", enabled: true } as {
		domain: string;
		enabled: boolean;
		cookie?: string;
	};

	test("part marker 上 filters out the 前編 novel, keeps the 上 movie", async () => {
		const html = makeSearchResultHtml([
			{
				asin: "NOVEL_ZENPEN",
				title: "STEINS;GATE 4　六分儀のイディオム：前編 (角川スニーカー文庫)",
			},
			{
				asin: "MOVIE_JOU",
				title: "劇場版 STEINS;GATE　負荷領域のデジャヴ 上 (角川スニーカー文庫)",
			},
		]);

		const $ = cheerio.load(html);
		const original = provider.fetchPage;
		provider.fetchPage = mock(() => Promise.resolve($));

		const asin = await provider.searchForAsin(
			"https://amazon.co.jp/s?k=test",
			config,
			"劇場版 STEINS;GATE　負荷領域のデジャヴ 上",
			false, // no Arabic volume number
			false,
		);

		expect(asin).toBe("MOVIE_JOU");
		provider.fetchPage = original;
	});

	test("when only the conflicting 前編 novel exists, returns null (no wrong link)", async () => {
		const html = makeSearchResultHtml([
			{
				asin: "NOVEL_ZENPEN",
				title: "STEINS;GATE 4　六分儀のイディオム：前編 (角川スニーカー文庫)",
			},
		]);

		const $ = cheerio.load(html);
		const original = provider.fetchPage;
		provider.fetchPage = mock(() => Promise.resolve($));

		const asin = await provider.searchForAsin(
			"https://amazon.co.jp/s?k=test",
			config,
			"劇場版 STEINS;GATE　負荷領域のデジャヴ 上",
			false,
			false,
		);

		expect(asin).toBeNull();
		provider.fetchPage = original;
	});
});

// ─── searchForAsin: angle-bracket cross-reference pollution ─────────
// A title that cites the series' vol 1 in <…> must still match its own volume,
// not the cited vol 1 (the 青春ブタ野郎 プチデビル後輩 wrong-link bug).

describe("real-world: <…> series anchor must not pull to vol 1", () => {
	const makeSearchResultHtml = (items: { asin: string; title: string }[]) =>
		`<html><body><span data-component-type="s-search-results">${items
			.map(
				(item) => `<div data-asin="${item.asin}">
					<div data-cy="title-recipe"><h2>${item.title}</h2></div>
				</div>`,
			)
			.join("")}</span></body></html>`;

	const config = { domain: "co.jp", enabled: true } as {
		domain: string;
		enabled: boolean;
		cookie?: string;
	};

	test("matches プチデビル後輩, not the <バニーガール先輩> anchor", async () => {
		const html = makeSearchResultHtml([
			{
				asin: "VOL1_BUNNY",
				title: "青春ブタ野郎はバニーガール先輩の夢を見ない (電撃文庫)",
			},
			{
				asin: "VOL2_PETIT",
				title: "青春ブタ野郎はプチデビル後輩の夢を見ない (電撃文庫)",
			},
		]);

		const $ = cheerio.load(html);
		const original = provider.fetchPage;
		provider.fetchPage = mock(() => Promise.resolve($));

		const asin = await provider.searchForAsin(
			"https://amazon.co.jp/s?k=test",
			config,
			"青春ブタ野郎はプチデビル後輩の夢を見ない<青春ブタ野郎はバニーガール先輩の夢を見ない> (電撃文庫)",
			false,
			false,
		);

		expect(asin).toBe("VOL2_PETIT");
		provider.fetchPage = original;
	});
});

// ─── Product page cache ─────────────────────────────────

describe("product page cache", () => {
	test("re-enriching the same ASIN reuses the parsed page", async () => {
		const bookHtml = `<html><body><span id="productTitle">キャッシュの本</span></body></html>`;
		const original = provider.fetchPage;
		const fetchMock = mock(() => Promise.resolve(cheerio.load(bookHtml)));
		provider.fetchPage = fetchMock;

		const { metadata: first } = await firstMatch(amazonProvider, {
			asin: "B000CACHE1",
			bookId: 1,
			uuid: "u1",
		});
		const { metadata: second } = await firstMatch(amazonProvider, {
			asin: "B000CACHE1",
			bookId: 2,
			uuid: "u2",
		});

		expect(first.title).toBe("キャッシュの本");
		expect(second).toEqual(first);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		provider.fetchPage = original;
	});

	test("mutating a returned result does not poison the cache", async () => {
		const bookHtml = `<html><body><span id="productTitle">不変の本</span></body></html>`;
		const original = provider.fetchPage;
		provider.fetchPage = mock(() => Promise.resolve(cheerio.load(bookHtml)));

		const { metadata: first } = await firstMatch(amazonProvider, {
			asin: "B000CACHE2",
			bookId: 1,
			uuid: "u1",
		});
		first.title = "書き換えた";

		const { metadata: second } = await firstMatch(amazonProvider, {
			asin: "B000CACHE2",
			bookId: 2,
			uuid: "u2",
		});
		expect(second.title).toBe("不変の本");
		provider.fetchPage = original;
	});

	test("cache key includes the domain", async () => {
		const jpHtml = `<html><body><span id="productTitle">日本の版</span></body></html>`;
		const usHtml = `<html><body><span id="productTitle">US edition</span></body></html>`;
		const original = provider.fetchPage;
		provider.fetchPage = mock((url: unknown) =>
			Promise.resolve(
				cheerio.load(String(url).includes("amazon.co.jp") ? jpHtml : usHtml),
			),
		);

		const { metadata: jp } = await firstMatch(amazonProvider, {
			asin: "B000CACHE3",
			bookId: 1,
			uuid: "u1",
		});
		const { metadata: us } = await firstMatch(amazonProvider, {
			asin: "B000CACHE3",
			bookId: 2,
			uuid: "u2",
			amazonDomain: "com",
		});

		expect(jp.title).toBe("日本の版");
		expect(us.title).toBe("US edition");
		provider.fetchPage = original;
	});
});

// ─── Search cache ───────────────────────────────────────

describe("search cache", () => {
	const config = { domain: "co.jp", enabled: true };
	const searchHtml = `<html><body><span data-component-type="s-search-results">
		<div data-asin="B000HIT"><div data-cy="title-recipe"><h2>タイトル (文庫)</h2></div></div>
	</span></body></html>`;

	test("repeating the same search reuses cached candidates", async () => {
		const original = provider.fetchPage;
		const fetchMock = mock(() => Promise.resolve(cheerio.load(searchHtml)));
		provider.fetchPage = fetchMock;

		const a = await provider.searchForAsin(
			"https://amazon.co.jp/s?k=t",
			config,
			"タイトル",
			true,
			false,
		);
		const b = await provider.searchForAsin(
			"https://amazon.co.jp/s?k=t",
			config,
			"タイトル",
			true,
			false,
		);

		expect(a).toBe("B000HIT");
		expect(b).toBe("B000HIT");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		provider.fetchPage = original;
	});

	test("a different filter input bypasses the cache", async () => {
		const original = provider.fetchPage;
		const fetchMock = mock(() => Promise.resolve(cheerio.load(searchHtml)));
		provider.fetchPage = fetchMock;

		await provider.searchForAsin(
			"https://amazon.co.jp/s?k=t",
			config,
			"タイトル",
			true,
			false,
		);
		await provider.searchForAsin(
			"https://amazon.co.jp/s?k=t",
			config,
			"タイトル",
			false, // different inputHasVolume → different selection semantics
			false,
		);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		provider.fetchPage = original;
	});
});

// ─── In-flight coalescing ───────────────────────────────

describe("in-flight coalescing", () => {
	test("concurrent enrichments of the same ASIN share one fetch", async () => {
		const bookHtml = `<html><body><span id="productTitle">同時の本</span></body></html>`;
		const original = provider.fetchPage;
		const fetchMock = mock(
			() =>
				new Promise((resolve) =>
					setTimeout(() => resolve(cheerio.load(bookHtml)), 10),
				),
		);
		provider.fetchPage = fetchMock;

		const [{ metadata: a }, { metadata: b }] = await Promise.all([
			firstMatch(amazonProvider, { asin: "B000RACE1", bookId: 1, uuid: "u1" }),
			firstMatch(amazonProvider, { asin: "B000RACE1", bookId: 2, uuid: "u2" }),
		]);

		expect(a.title).toBe("同時の本");
		expect(b).toEqual(a);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		provider.fetchPage = original;
	});

	test("concurrent identical searches share one fetch", async () => {
		const searchHtml = `<html><body><span data-component-type="s-search-results">
			<div data-asin="B000RACE2"><div data-cy="title-recipe"><h2>タイトル (文庫)</h2></div></div>
		</span></body></html>`;
		const config = { domain: "co.jp", enabled: true };
		const original = provider.fetchPage;
		const fetchMock = mock(
			() =>
				new Promise((resolve) =>
					setTimeout(() => resolve(cheerio.load(searchHtml)), 10),
				),
		);
		provider.fetchPage = fetchMock;

		const [a, b] = await Promise.all([
			provider.searchForAsin(
				"https://amazon.co.jp/s?k=t",
				config,
				"タイトル",
				true,
				false,
			),
			provider.searchForAsin(
				"https://amazon.co.jp/s?k=t",
				config,
				"タイトル",
				true,
				false,
			),
		]);

		expect(a).toBe("B000RACE2");
		expect(b).toBe("B000RACE2");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		provider.fetchPage = original;
	});

	test("a failed in-flight request is not cached; the next call refetches", async () => {
		const bookHtml = `<html><body><span id="productTitle">再試行の本</span></body></html>`;
		const original = provider.fetchPage;
		let calls = 0;
		const fetchMock = mock(() => {
			calls++;
			if (calls === 1) return Promise.reject(new Error("network boom"));
			return Promise.resolve(cheerio.load(bookHtml));
		});
		provider.fetchPage = fetchMock;

		// Non-transient errors are swallowed by getMetadata into {}.
		const { metadata: first } = await firstMatch(amazonProvider, {
			asin: "B000RACE3",
			bookId: 1,
			uuid: "u1",
		});
		expect(first).toEqual({});

		const { metadata: second } = await firstMatch(amazonProvider, {
			asin: "B000RACE3",
			bookId: 2,
			uuid: "u2",
		});
		expect(second.title).toBe("再試行の本");
		expect(fetchMock).toHaveBeenCalledTimes(2);
		provider.fetchPage = original;
	});
});

// ─── Session cookie capture ─────────────────────────────

describe("session cookie capture", () => {
	type DomainStateLike = {
		consecutiveFailures: number;
		cooldownUntil: number;
		delayFactor: number;
		cookieJar: Map<string, string>;
	};
	const state = (domain: string) =>
		provider.domainState(domain) as DomainStateLike;

	test("captured cookies are sent; the configured cookie wins on conflict", () => {
		state("co.jp").cookieJar.set("session-id", "captured");
		state("co.jp").cookieJar.set("ubid-acbjp", "xyz");

		const headers = provider.getHeaders(
			"co.jp",
			"session-id=configured",
		) as Record<string, string>;

		expect(headers.cookie).toContain("session-id=configured");
		expect(headers.cookie).not.toContain("session-id=captured");
		expect(headers.cookie).toContain("ubid-acbjp=xyz");
	});

	test("without a configured cookie, the jar alone is sent", () => {
		state("co.jp").cookieJar.set("session-id", "abc123");
		const headers = provider.getHeaders("co.jp", undefined) as Record<
			string,
			string
		>;
		expect(headers.cookie).toBe("session-id=abc123");
	});

	test("absorbSetCookies keeps name=value and drops attributes", () => {
		const response = new Response("", {
			headers: { "set-cookie": "session-id=abc123; Path=/; Secure; HttpOnly" },
		});
		provider.absorbSetCookies(state("co.jp"), response);
		expect(state("co.jp").cookieJar.get("session-id")).toBe("abc123");
	});
});

// ─── Per-domain circuit breaker & adaptive pacing ───────

describe("per-domain circuit breaker", () => {
	type DomainStateLike = {
		consecutiveFailures: number;
		cooldownUntil: number;
	};
	const state = (domain: string) =>
		provider.domainState(domain) as DomainStateLike;

	test("a blocked domain fails fast while other domains keep working", async () => {
		const jp = state("co.jp");
		jp.consecutiveFailures = 3;
		jp.cooldownUntil = Date.now() + 60_000;

		await expect(provider.throttle("co.jp", false)).rejects.toThrow(
			"consecutive failures",
		);
		// Independent host: must not throw.
		await provider.throttle("com", false);
	});

	test("after the cooldown the breaker closes with a fresh failure budget", async () => {
		const jp = state("co.jp");
		jp.consecutiveFailures = 3;
		jp.cooldownUntil = Date.now() - 1;

		await provider.throttle("co.jp", false);
		expect(jp.consecutiveFailures).toBe(0);
	});
});

describe("adaptive delay factor", () => {
	type DomainStateLike = { consecutiveFailures: number; delayFactor: number };
	const state = (domain: string) =>
		provider.domainState(domain) as DomainStateLike;

	test("a successful fetch decays the delay factor toward the floor", async () => {
		const bigHtml = `<html><body>${"x".repeat(60000)}</body></html>`;
		const originalFetch = globalThis.fetch;
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response(bigHtml, { status: 200 })),
		) as unknown as typeof fetch;

		try {
			await provider.fetchPage("https://www.amazon.co.jp/dp/TESTOK", {
				domain: "co.jp",
				enabled: true,
			});
			expect(state("co.jp").delayFactor).toBeCloseTo(0.98);
			expect(state("co.jp").consecutiveFailures).toBe(0);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("a block grows the delay factor and counts a failure", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("tiny block stub", { status: 200 })),
		) as unknown as typeof fetch;

		try {
			await expect(
				provider.fetchPage("https://www.amazon.co.jp/dp/TESTBLOCK", {
					domain: "co.jp",
					enabled: true,
				}),
			).rejects.toThrow("Anti-scraping");
			expect(state("co.jp").delayFactor).toBeCloseTo(1.8);
			expect(state("co.jp").consecutiveFailures).toBe(1);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("the first anti-bot response fails immediately without more requests", async () => {
		const originalFetch = globalThis.fetch;
		const fetchMock = mock(() =>
			Promise.resolve(new Response("tiny block stub", { status: 200 })),
		) as unknown as typeof fetch;
		const sleepSpy = spyOn(Bun, "sleep").mockImplementation(() =>
			Promise.resolve(),
		);
		globalThis.fetch = fetchMock;

		try {
			await expect(
				provider.fetchPage("https://www.amazon.first-block.test/dp/X", {
					domain: "first-block.test",
					enabled: true,
				}),
			).rejects.toThrow();
			expect(fetchMock).toHaveBeenCalledTimes(1);
		} finally {
			sleepSpy.mockRestore();
			globalThis.fetch = originalFetch;
		}
	});
});
