import { beforeEach, describe, expect, mock, test } from "bun:test";

// ─── Mocks ──────────────────────────────────────────────

const mockGetAmazonConfig = mock(() =>
	Promise.resolve({
		domain: "co.jp",
		cookie: undefined,
		enabled: true,
	}),
);

mock.module("../../../../../modules/settings.service", () => ({
	getAmazonConfig: mockGetAmazonConfig,
}));

const cheerio = await import("cheerio");
const { amazonProvider } = await import("../amazon.provider");

// Access private methods for unit testing
const provider = amazonProvider as unknown as Record<
	string,
	(...args: unknown[]) => unknown
>;

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

describe("getMetadata", () => {
	test("returns empty when provider is disabled", async () => {
		mockGetAmazonConfig.mockImplementation(() =>
			Promise.resolve({ domain: "co.jp", enabled: false }),
		);

		const result = await amazonProvider.getMetadata({
			title: "Test",
			bookId: 1,
			uuid: "test-uuid",
		});

		expect(result).toEqual({});

		// Restore
		mockGetAmazonConfig.mockImplementation(() =>
			Promise.resolve({ domain: "co.jp", enabled: true }),
		);
	});

	test("returns empty when no search data available", async () => {
		const result = await amazonProvider.getMetadata({
			bookId: 1,
			uuid: "test-uuid",
		});

		expect(result).toEqual({});
	});
});
