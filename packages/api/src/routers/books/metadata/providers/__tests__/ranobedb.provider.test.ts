import { beforeEach, describe, expect, mock, test } from "bun:test";

// ─── Mocks ──────────────────────────────────────────────

const mockGetRanobedbConfig = mock(() =>
	Promise.resolve({ enabled: true, autoUpdate: false }),
);

// Includes getAmazonConfig so this mock doesn't break amazon.provider.test.ts
// when both files share the same Bun process (see CLAUDE.md mock pollution note).
mock.module("../../../../settings/settings.service", () => ({
	getRanobedbConfig: mockGetRanobedbConfig,
	getAmazonConfig: () =>
		Promise.resolve({ domain: "co.jp", cookie: undefined, enabled: true }),
	setRanobedbConfig: () => Promise.resolve({}),
}));

type QueryHandler = (sql: string, params: unknown[]) => unknown[] | null;
let queryHandler: QueryHandler = () => null;

const mockQueryRanobedb = mock((sql: string, params?: unknown[]) =>
	Promise.resolve(queryHandler(sql, params ?? [])),
);

mock.module("../../../../../infrastructure/ranobedb/ranobedb.client", () => ({
	RANOBEDB_DATABASE: "ranobedb",
	queryRanobedb: mockQueryRanobedb,
	resetRanobedbPool: () => Promise.resolve(),
	isRanobedbReady: () => Promise.resolve(true),
}));

const { ranobedbProvider } = await import("../ranobedb.provider");

// ─── Fixtures ────────────────────────────────────────────

const RNDB_BOOK_ID = 4242;

function metadataHandler(sql: string): unknown[] | null {
	if (sql.includes("FROM book WHERE id = $1")) {
		return [
			{
				id: RNDB_BOOK_ID,
				description: "English description",
				description_ja: "日本語のあらすじ",
				olang: "ja",
			},
		];
	}
	if (sql.includes("FROM book_title WHERE book_id = $1")) {
		return [
			{
				book_id: RNDB_BOOK_ID,
				lang: "ja",
				title: "アクセル・ワールド12",
				romaji: "Accel World 12",
			},
			{
				book_id: RNDB_BOOK_ID,
				lang: "en",
				title: "Accel World, Vol. 12",
				romaji: null,
			},
		];
	}
	if (sql.includes("rb.rtype")) {
		return [
			{
				release_date: 20130810,
				pages: 250,
				format: "print",
				lang: "ja",
				isbn13: "9784048912280",
				amazon: "https://www.amazon.co.jp/dp/4048912283",
				rtype: "complete",
			},
			{
				release_date: 20130815,
				pages: 248,
				format: "digital",
				lang: "ja",
				isbn13: null,
				amazon: "https://www.amazon.co.jp/dp/B00EXAMPLE",
				rtype: "complete",
			},
		];
	}
	if (sql.includes("JOIN series_title st ON st.series_id = sb.series_id")) {
		return [
			{ title: "アクセル・ワールド", romaji: "Accel World", sort_order: 12 },
		];
	}
	if (sql.includes("book_staff_alias")) {
		return [
			{ name: "HIMA", romaji: null, role_type: "artist" },
			{ name: "川原礫", romaji: "Kawahara Reki", role_type: "author" },
		];
	}
	if (sql.includes("release_publisher")) {
		return [{ name: "電撃文庫" }];
	}
	if (sql.includes("ttype = 'genre'")) {
		return [{ name: "Sci-fi" }, { name: "Action" }, { name: "Sci-fi" }];
	}
	return null;
}

beforeEach(() => {
	mockGetRanobedbConfig.mockImplementation(() =>
		Promise.resolve({ enabled: true, autoUpdate: false }),
	);
	queryHandler = () => null;
});

// ─── Tests ───────────────────────────────────────────────

describe("RanobedbProvider", () => {
	test("returns {} when disabled", async () => {
		mockGetRanobedbConfig.mockImplementation(() =>
			Promise.resolve({ enabled: false, autoUpdate: false }),
		);
		// Gate only applies when an organization is resolved; throw if it queries
		// the dump so a broken gate fails loudly instead of passing by accident.
		queryHandler = () => {
			throw new Error("should not query when disabled");
		};
		const result = await ranobedbProvider.getMetadata({
			isbn13: "123",
			serverId: "org-1",
		});
		expect(result).toEqual({});
	});

	test("returns {} when the database is unavailable (null queries)", async () => {
		const result = await ranobedbProvider.getMetadata({
			isbn13: "9784048912280",
			title: "アクセル・ワールド12",
		});
		expect(result).toEqual({});
	});

	test("resolves by isbn13 and maps full metadata", async () => {
		queryHandler = (sql) => {
			if (sql.includes("isbn13 = $1")) return [{ book_id: RNDB_BOOK_ID }];
			return metadataHandler(sql);
		};

		const result = await ranobedbProvider.getMetadata({
			isbn13: "9784048912280",
		});

		expect(result.title).toBe("アクセル・ワールド12");
		expect(result.titleRomaji).toBe("Accel World 12");
		expect(result.description).toBe("日本語のあらすじ");
		expect(result.isbn13).toBe("9784048912280");
		// ASIN comes from the digital release only (print /dp/ is an ISBN-10)
		expect(result.asin).toBe("B00EXAMPLE");
		expect(result.publisher).toEqual({ name: "電撃文庫" });
		expect(result.publishedDate).toBe("2013-08-10");
		expect(result.pageCount).toBe(248);
		expect(result.series).toEqual({
			name: "アクセル・ワールド",
			position: 12,
		});
		expect(result.genres).toEqual(["Sci-fi", "Action"]);
		// Never returns a cover
		expect(result).not.toHaveProperty("cover");
	});

	test("maps staff roles with authors first", async () => {
		queryHandler = (sql) => {
			if (sql.includes("isbn13 = $1")) return [{ book_id: RNDB_BOOK_ID }];
			return metadataHandler(sql);
		};

		const result = await ranobedbProvider.getMetadata({
			isbn13: "9784048912280",
		});

		expect(result.authors).toEqual([
			{ name: "川原礫", role: "Author" },
			{ name: "HIMA", role: "Illustrator" },
		]);
	});

	test("resolves by asin in the amazon URL", async () => {
		const seenParams: unknown[][] = [];
		queryHandler = (sql, params) => {
			if (sql.includes("'%/dp/' ||")) {
				seenParams.push(params);
				return [{ book_id: RNDB_BOOK_ID }];
			}
			return metadataHandler(sql);
		};

		const result = await ranobedbProvider.getMetadata({ asin: "B00EXAMPLE" });
		expect(seenParams[0]).toEqual(["B00EXAMPLE"]);
		expect(result.title).toBe("アクセル・ワールド12");
	});

	test("resolves by title with volume number filter", async () => {
		queryHandler = (sql) => {
			if (sql.includes("JOIN book b ON")) {
				return [
					{
						book_id: 1111,
						title: "アクセル・ワールド11",
						romaji: "Accel World 11",
					},
					{
						book_id: RNDB_BOOK_ID,
						title: "アクセル・ワールド12",
						romaji: "Accel World 12",
					},
				];
			}
			return metadataHandler(sql);
		};

		const result = await ranobedbProvider.getMetadata({
			title: "アクセル・ワールド12",
		});
		expect(result.title).toBe("アクセル・ワールド12");
	});

	test("falls back to series volume pick when title has no direct match", async () => {
		queryHandler = (sql) => {
			if (sql.includes("JOIN book b ON")) return [];
			if (sql.includes("FROM series_title st")) {
				return [
					{ series_id: 99, title: "アクセル・ワールド", romaji: "Accel World" },
				];
			}
			if (sql.includes("ORDER BY sb.sort_order ASC")) {
				// sort_order drifted (+1) by an earlier 5.5 volume — the pick
				// must go by the volume number in the title, not sort_order
				return [
					{ book_id: 1111, sort_order: 12, title: "アクセル・ワールド11" },
					{
						book_id: RNDB_BOOK_ID,
						sort_order: 13,
						title: "アクセル・ワールド12",
					},
				];
			}
			return metadataHandler(sql);
		};

		const result = await ranobedbProvider.getMetadata({
			title: "アクセル・ワールド 12",
		});
		expect(result.title).toBe("アクセル・ワールド12");
	});

	test("matches titles despite full-width vs half-width punctuation", async () => {
		const seenPatterns: unknown[] = [];
		queryHandler = (sql, params) => {
			if (sql.includes("JOIN book b ON")) {
				seenPatterns.push(params[0]);
				// DB stores half-width punctuation
				return [
					{
						book_id: RNDB_BOOK_ID,
						title:
							"わたしが恋人になれるわけないじゃん、ムリムリ!(※ムリじゃなかった!?) 2",
						romaji: null,
					},
				];
			}
			return metadataHandler(sql);
		};

		// Input uses full-width ！（）
		const result = await ranobedbProvider.getMetadata({
			title:
				"わたしが恋人になれるわけないじゃん、ムリムリ！（※ムリじゃなかった!?） 2",
		});
		// Pattern must not contain punctuation — only letter/digit runs
		expect(seenPatterns[0]).toBe(
			"%わたしが恋人になれるわけないじゃん%ムリムリ%ムリじゃなかった%2%",
		);
		expect(result.title).toBe("アクセル・ワールド12");
	});

	test("input without volume prefers the volume-less title (vol 1), not closest length", async () => {
		queryHandler = (sql) => {
			if (sql.includes("JOIN book b ON")) {
				return [
					// vol 10 is closer in length to the label-polluted input
					{
						book_id: 9999,
						title: "エイルン・ラストコード ~架空世界より戦場へ~ 10",
						romaji: null,
					},
					{
						book_id: RNDB_BOOK_ID,
						title: "エイルン・ラストコード ~架空世界より戦場へ~",
						romaji: null,
					},
				];
			}
			return metadataHandler(sql);
		};

		const result = await ranobedbProvider.getMetadata({
			title: "エイルン・ラストコード ～架空世界より戦場へ～ (MF文庫J)",
		});
		expect(result.title).toBe("アクセル・ワールド12");
	});

	test("strips Kindle store branding (「X」シリーズ + imprint parens) before matching", async () => {
		const seenPatterns: string[] = [];
		queryHandler = (sql, params) => {
			if (sql.includes("JOIN book b ON")) {
				seenPatterns.push(params[0] as string);
				return [
					{ book_id: RNDB_BOOK_ID, title: "涼宮ハルヒの憂鬱", romaji: null },
				];
			}
			return metadataHandler(sql);
		};

		const result = await ranobedbProvider.getMetadata({
			title: "涼宮ハルヒの憂鬱 「涼宮ハルヒ」シリーズ (角川スニーカー文庫)",
		});
		// Branding must not leak into the SQL pattern
		expect(seenPatterns[0]).toBe("%涼宮ハルヒの憂鬱%");
		expect(result.title).toBe("アクセル・ワールド12");
	});

	test("relaxed anchor skips imprint tokens longer than the real title", async () => {
		const seenPatterns: string[] = [];
		queryHandler = (sql, params) => {
			if (sql.includes("JOIN book b ON")) {
				seenPatterns.push(params[0] as string);
				// Primary (with bare label prefix) finds nothing; relaxed must
				// anchor on the title, not on ガガガ文庫
				return seenPatterns.length === 1
					? []
					: [{ book_id: RNDB_BOOK_ID, title: "俺の青春", romaji: null }];
			}
			return metadataHandler(sql);
		};

		await ranobedbProvider.getMetadata({ title: "ガガガ文庫 俺の青春" });
		expect(seenPatterns[1]).toBe("%俺の青春%");
	});

	test("relaxed retry matches titles with label prefix and edition suffix", async () => {
		const seenPatterns: string[] = [];
		queryHandler = (sql, params) => {
			if (sql.includes("JOIN book b ON")) {
				seenPatterns.push(params[0] as string);
				// Full pattern (with ガガガ文庫/イラスト完全版) finds nothing;
				// the relaxed retry (longest token + volume) finds the book
				return seenPatterns.length === 1
					? []
					: [
							{
								book_id: RNDB_BOOK_ID,
								title: "やはり俺の青春ラブコメはまちがっている。9",
								romaji: null,
							},
						];
			}
			return metadataHandler(sql);
		};

		const result = await ranobedbProvider.getMetadata({
			title:
				"ガガガ文庫 やはり俺の青春ラブコメはまちがっている。9（イラスト完全版）",
		});
		expect(seenPatterns[1]).toBe("%やはり俺の青春ラブコメはまちがっている%9%");
		expect(result.title).toBe("アクセル・ワールド12");
	});

	test("series position prefers the trailing volume label over sort_order", async () => {
		queryHandler = (sql) => {
			if (sql.includes("isbn13 = $1")) return [{ book_id: RNDB_BOOK_ID }];
			if (sql.includes("FROM book_title WHERE book_id = $1")) {
				return [
					{
						book_id: RNDB_BOOK_ID,
						lang: "ja",
						title: "やはり俺の青春ラブコメはまちがっている。14.5",
						romaji: null,
					},
				];
			}
			if (sql.includes("JOIN series_title st ON st.series_id = sb.series_id")) {
				// sort_order drifted to 18 because of earlier .5 volumes
				return [
					{
						title: "やはり俺の青春ラブコメはまちがっている。",
						romaji: null,
						sort_order: 18,
					},
				];
			}
			return metadataHandler(sql);
		};

		const result = await ranobedbProvider.getMetadata({
			isbn13: "9784094530049",
		});
		expect(result.series?.position).toBe(14.5);
	});

	test("falls back to the print ASIN (ISBN-10) when digital has no amazon URL", async () => {
		queryHandler = (sql) => {
			if (sql.includes("isbn13 = $1")) return [{ book_id: RNDB_BOOK_ID }];
			if (sql.includes("rb.rtype")) {
				return [
					{
						release_date: 20150201,
						pages: 351,
						format: "print",
						lang: "ja",
						isbn13: "9784864723428",
						amazon: "https://www.amazon.co.jp/dp/4864723427",
						rtype: "complete",
					},
					{
						release_date: 20150227,
						pages: 394,
						format: "digital",
						lang: "ja",
						isbn13: null,
						amazon: null,
						rtype: "complete",
					},
				];
			}
			return metadataHandler(sql);
		};

		const result = await ranobedbProvider.getMetadata({
			isbn13: "9784864723428",
		});
		expect(result.asin).toBe("4864723427");
		// Digital release is still preferred for page count
		expect(result.pageCount).toBe(394);
	});

	test("skips placeholder release dates (99 markers)", async () => {
		queryHandler = (sql) => {
			if (sql.includes("isbn13 = $1")) return [{ book_id: RNDB_BOOK_ID }];
			if (sql.includes("rb.rtype")) {
				return [
					{
						release_date: 20249999,
						pages: null,
						format: "digital",
						lang: "ja",
						isbn13: null,
						amazon: null,
						rtype: "complete",
					},
					{
						release_date: 20240315,
						pages: 300,
						format: "print",
						lang: "ja",
						isbn13: "9784000000000",
						amazon: null,
						rtype: "complete",
					},
				];
			}
			return metadataHandler(sql);
		};

		const result = await ranobedbProvider.getMetadata({
			isbn13: "9784000000000",
		});
		expect(result.publishedDate).toBe("2024-03-15");
	});
});
