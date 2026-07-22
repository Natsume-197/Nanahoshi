import { beforeEach, describe, expect, mock, test } from "bun:test";

// ─── Mocks ──────────────────────────────────────────────

const mockGetRanobedbConfig = mock(() =>
	Promise.resolve({ enabled: true, autoUpdate: false }),
);

// Includes every provider-config getter so this mock doesn't break the other
// provider test files sharing the same Bun process (see CLAUDE.md mock
// pollution note).
mock.module("../../../../settings/settings.service", () => ({
	getRanobedbConfig: mockGetRanobedbConfig,
	getAmazonConfig: () =>
		Promise.resolve({ domain: "co.jp", cookie: undefined, enabled: true }),
	setRanobedbConfig: () => Promise.resolve({}),
	getGoogleBooksConfig: () => Promise.resolve({ enabled: true }),
	getOpenLibraryConfig: () => Promise.resolve({ enabled: true }),
	getGoodreadsConfig: () => Promise.resolve({ enabled: true }),
	getComicvineConfig: () =>
		Promise.resolve({ enabled: true, apiKey: "test-key" }),
	getHardcoverConfig: () =>
		Promise.resolve({ enabled: true, apiToken: "test-token" }),
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
			{
				title: "アクセル・ワールド",
				romaji: "Accel World",
				sort_order: 12,
				aliases: "Accel World\r\nAW\n accel   world \nアクセル・ワールド",
			},
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
	if (sql.includes("ttype IN ('tag', 'demographic')")) {
		return [{ name: "virtual world" }, { name: "seinen" }, { name: "seinen" }];
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
		const { metadata: result } = await ranobedbProvider.getMetadata({
			isbn13: "123",
			serverId: "org-1",
		});
		expect(result).toEqual({});
	});

	test("returns {} when the database is unavailable (null queries)", async () => {
		const { metadata: result } = await ranobedbProvider.getMetadata({
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

		const { metadata: result } = await ranobedbProvider.getMetadata({
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
			aliases: ["Accel World", "AW"],
		});
		expect(result.genres).toEqual(["Sci-fi", "Action"]);
		// Tags: ttype 'tag' + 'demographic', deduplicated, separate from genres
		expect(result.tags).toEqual(["virtual world", "seinen"]);
		// Never returns a cover
		expect(result).not.toHaveProperty("cover");
	});

	test("maps staff roles with authors first", async () => {
		queryHandler = (sql) => {
			if (sql.includes("isbn13 = $1")) return [{ book_id: RNDB_BOOK_ID }];
			return metadataHandler(sql);
		};

		const { metadata: result } = await ranobedbProvider.getMetadata({
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

		const { metadata: result } = await ranobedbProvider.getMetadata({
			asin: "B00EXAMPLE",
		});
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

		const { metadata: result } = await ranobedbProvider.getMetadata({
			title: "アクセル・ワールド12",
		});
		expect(result.title).toBe("アクセル・ワールド12");
	});

	test("resolves Unicode Roman volumes to the matching RanobeDB book", async () => {
		let selectedBookId: unknown;
		const seenPatterns: unknown[] = [];
		queryHandler = (sql, params) => {
			if (sql.includes("JOIN book b ON")) {
				seenPatterns.push(params[0]);
				return [
					{
						book_id: 14185,
						title: "本好きの下剋上 第一部「兵士の娘I」",
						romaji: null,
					},
					{
						book_id: 14359,
						title: "本好きの下剋上 第一部「兵士の娘II」",
						romaji: null,
					},
					{
						book_id: 15173,
						title: "本好きの下剋上 第一部「兵士の娘III」",
						romaji: null,
					},
				];
			}
			if (sql.includes("WHERE bsa.book_id = ANY")) {
				return [14185, 14359, 15173].map((bookId) => ({
					book_id: bookId,
					name: "香月美夜",
					romaji: "Miya Kazuki",
				}));
			}
			if (sql.includes("FROM book WHERE id = $1")) {
				selectedBookId = params[0];
			}
			return metadataHandler(sql);
		};

		await ranobedbProvider.getMetadata({
			title: "本好きの下剋上 第一部 兵士の娘Ⅱ",
			authors: [{ name: "香月 美夜" }],
		});

		expect(seenPatterns[0]).toContain("II");
		expect(String(seenPatterns[0])).not.toContain("Ⅱ");
		expect(selectedBookId).toBe(14359);
	});

	test("does not turn a missing fanbook into main-series volume 1", async () => {
		let queriedSeriesFallback = false;
		queryHandler = (sql) => {
			if (sql.includes("JOIN book b ON")) {
				return [
					{
						book_id: 14185,
						title: "本好きの下剋上 第一部「兵士の娘I」",
						romaji: null,
					},
				];
			}
			if (sql.includes("WHERE bsa.book_id = ANY")) {
				return [
					{
						book_id: 14185,
						name: "香月美夜",
						romaji: "Miya Kazuki",
					},
				];
			}
			if (sql.includes("FROM series_title st")) queriedSeriesFallback = true;
			return metadataHandler(sql);
		};

		const { metadata: result } = await ranobedbProvider.getMetadata({
			title: "本好きの下剋上 ふぁんぶっく",
			authors: [{ name: "香月 美夜" }],
		});

		expect(result).toEqual({});
		expect(queriedSeriesFallback).toBe(false);
	});

	test("does not relax a missing anthology to another supplement in the franchise", async () => {
		const seenPatterns: string[] = [];
		queryHandler = (sql, params) => {
			if (sql.includes("JOIN book b ON")) {
				seenPatterns.push(params[0] as string);
				return seenPatterns.length === 1
					? []
					: [
							{
								book_id: RNDB_BOOK_ID,
								title: "この素晴らしい世界に祝福を! よりみち!",
								romaji: "Kono Subarashii Sekai ni Shukufuku o! Yori Michi!",
							},
						];
			}
			if (sql.includes("WHERE bsa.book_id = ANY")) {
				return [
					{ book_id: RNDB_BOOK_ID, name: "暁なつめ", romaji: null },
					{ book_id: RNDB_BOOK_ID, name: "三嶋くろね", romaji: null },
				];
			}
			return metadataHandler(sql);
		};

		const { metadata: result } = await ranobedbProvider.getMetadata({
			title: "この素晴らしい世界に祝福を！ めぐみんアンソロジー 紅Aka",
			authors: [
				{ name: "暁なつめ", role: "Author" },
				{ name: "三嶋くろね", role: "Author" },
			],
		});

		expect(result).toEqual({});
		expect(seenPatterns).toEqual([
			"%この素晴らしい世界に祝福を%めぐみんアンソロジー%紅Aka%",
		]);
	});

	test("retries a supplement without its recurring series tagline", async () => {
		const fanbook2Id = 9999;
		const seenPatterns: unknown[] = [];
		queryHandler = (sql, params) => {
			if (sql.includes("JOIN book b ON")) {
				seenPatterns.push(params[0]);
				if (seenPatterns.length === 1) return [];
				return [
					{
						book_id: fanbook2Id,
						title: "本好きの下剋上ふぁんぶっく2",
						romaji: null,
					},
					{
						book_id: RNDB_BOOK_ID,
						title: "本好きの下剋上ふぁんぶっく",
						romaji: null,
					},
				];
			}
			if (sql.includes("FROM book_title WHERE book_id = $1")) {
				return [
					{
						book_id: RNDB_BOOK_ID,
						lang: "ja",
						title: "本好きの下剋上ふぁんぶっく",
						romaji: "Honzuki no Gekokujou Fanbook",
					},
				];
			}
			if (sql.includes("JOIN series_title st ON st.series_id = sb.series_id")) {
				return [
					{
						title: "本好きの下剋上(ふぁんぶっく)",
						romaji: "Honzuki no Gekokujou (Fanbook)",
						sort_order: 1,
						aliases: null,
					},
				];
			}
			if (sql.includes("book_staff_alias")) {
				return [
					{
						book_id: RNDB_BOOK_ID,
						name: "香月美夜",
						romaji: "Kazuki Miya",
						role_type: "author",
					},
					{
						book_id: fanbook2Id,
						name: "香月美夜",
						romaji: "Kazuki Miya",
						role_type: "author",
					},
				];
			}
			return metadataHandler(sql);
		};

		const { metadata: result } = await ranobedbProvider.getMetadata({
			title:
				"本好きの下剋上 〜司書になるためには手段を選んでいられません〜 ふぁんぶっく",
			authors: [{ name: "香月　美夜" }],
		});

		expect(seenPatterns).toEqual([
			"%本好きの下剋上%司書になるためには手段を選んでいられません%ふぁんぶっく%",
			"%本好きの下剋上%ふぁんぶっく%",
		]);
		expect(result.series).toEqual({
			name: "本好きの下剋上(ふぁんぶっく)",
			position: 1,
			aliases: ["Honzuki no Gekokujou (Fanbook)"],
		});
	});

	test("does not strip an omnibus marker and match volume 1", async () => {
		const seenPatterns: unknown[] = [];
		queryHandler = (sql, params) => {
			if (sql.includes("JOIN book b ON")) {
				seenPatterns.push(params[0]);
				return [
					{
						book_id: 14185,
						title: "私の推しは悪役令嬢。",
						romaji: null,
					},
				];
			}
			return metadataHandler(sql);
		};

		const { metadata: result } = await ranobedbProvider.getMetadata({
			title: "【合本版】私の推しは悪役令嬢。【全二巻】",
		});

		expect(seenPatterns[0]).toContain("合本版");
		expect(result).toEqual({});
	});

	test("does not match an upper/lower part to an unmarked volume", async () => {
		queryHandler = (sql) => {
			if (sql.includes("JOIN book b ON")) {
				return [{ book_id: 14185, title: "魔女の旅々", romaji: null }];
			}
			return metadataHandler(sql);
		};

		const { metadata: result } = await ranobedbProvider.getMetadata({
			title: "魔女の旅々（上）",
		});

		expect(result).toEqual({});
	});

	test("rejects an automatic title match when the authors conflict", async () => {
		queryHandler = (sql) => {
			if (sql.includes("JOIN book b ON")) {
				return [
					{ book_id: RNDB_BOOK_ID, title: "斜陽の国のルスダン", romaji: null },
				];
			}
			if (sql.includes("WHERE bsa.book_id = ANY")) {
				return [
					{
						book_id: RNDB_BOOK_ID,
						name: "並木陽",
						romaji: "Akira Namiki",
					},
				];
			}
			if (sql.includes("FROM series_title st")) return [];
			return metadataHandler(sql);
		};

		const { metadata: result } = await ranobedbProvider.getMetadata({
			title: "斜陽",
			authors: [{ name: "太宰治" }],
		});

		expect(result).toEqual({});
	});

	test("accepts a tolerant automatic title match when the author agrees", async () => {
		queryHandler = (sql) => {
			if (sql.includes("JOIN book b ON")) {
				return [
					{
						book_id: RNDB_BOOK_ID,
						title: "本好きの下剋上 第一部",
						romaji: null,
					},
				];
			}
			if (sql.includes("WHERE bsa.book_id = ANY")) {
				return [
					{
						book_id: RNDB_BOOK_ID,
						name: "香月美夜",
						romaji: "Miya Kazuki",
					},
				];
			}
			return metadataHandler(sql);
		};

		const { metadata: result } = await ranobedbProvider.getMetadata({
			title: "本好きの下剋上",
			authors: [{ name: "香月 美夜" }],
		});

		expect(result.title).toBe("アクセル・ワールド12");
	});

	test("rejects a short ambiguous title without author evidence", async () => {
		queryHandler = (sql) => {
			if (sql.includes("JOIN book b ON")) {
				return [{ book_id: RNDB_BOOK_ID, title: "斜陽", romaji: null }];
			}
			if (sql.includes("FROM series_title st")) return [];
			return metadataHandler(sql);
		};

		const { metadata: result } = await ranobedbProvider.getMetadata({
			title: "斜陽",
		});

		expect(result).toEqual({});
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

		const { metadata: result } = await ranobedbProvider.getMetadata({
			title: "アクセル・ワールド 12",
		});
		expect(result.title).toBe("アクセル・ワールド12");
	});

	test("does not accept volume 10 as a direct match for explicit volume 1", async () => {
		const volume10BookId = 1010;
		let builtBookId: number | null = null;
		queryHandler = (sql, params) => {
			if (sql.includes("JOIN book b ON")) {
				return [
					{
						book_id: volume10BookId,
						title: "魔女の旅々10",
						romaji: "Majo no Tabitabi 10",
					},
				];
			}
			if (sql.includes("FROM series_title st")) {
				return [{ series_id: 99, title: "魔女の旅々", romaji: null }];
			}
			if (sql.includes("ORDER BY sb.sort_order ASC")) {
				return [
					{ book_id: RNDB_BOOK_ID, sort_order: 1, title: "魔女の旅々" },
					{ book_id: volume10BookId, sort_order: 10, title: "魔女の旅々10" },
				];
			}
			if (sql.includes("FROM book WHERE id = $1")) {
				builtBookId = Number(params[0]);
			}
			return metadataHandler(sql);
		};

		await ranobedbProvider.getMetadata({ title: "魔女の旅々 1" });

		expect(builtBookId).toBe(RNDB_BOOK_ID);
	});

	test("rejects a series fallback when the selected volume has another author", async () => {
		queryHandler = (sql) => {
			if (sql.includes("JOIN book b ON")) return [];
			if (sql.includes("FROM series_title st")) {
				return [{ series_id: 99, title: "本好きの下剋上", romaji: null }];
			}
			if (sql.includes("ORDER BY sb.sort_order ASC")) {
				return [
					{ book_id: RNDB_BOOK_ID, sort_order: 1, title: "本好きの下剋上 1" },
				];
			}
			if (sql.includes("WHERE bsa.book_id = ANY")) {
				return [
					{
						book_id: RNDB_BOOK_ID,
						name: "香月美夜",
						romaji: "Miya Kazuki",
					},
				];
			}
			return metadataHandler(sql);
		};

		const { metadata: result } = await ranobedbProvider.getMetadata({
			title: "本好きの下剋上 1",
			authors: [{ name: "別の著者" }],
		});

		expect(result).toEqual({});
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
		const { metadata: result } = await ranobedbProvider.getMetadata({
			title:
				"わたしが恋人になれるわけないじゃん、ムリムリ！（※ムリじゃなかった!?） 2",
		});
		// Pattern must not contain punctuation — only letter/digit runs
		expect(seenPatterns[0]).toBe(
			"%わたしが恋人になれるわけないじゃん%ムリムリ%ムリじゃなかった%2%",
		);
		expect(result.title).toBe("アクセル・ワールド12");
	});

	test("matches decorative dash variants and applies the RanobeDB series", async () => {
		queryHandler = (sql) => {
			if (sql.includes("JOIN book b ON")) {
				return [
					{
						book_id: RNDB_BOOK_ID,
						title: "86―エイティシックス―Ep.9 ―ヴァルキリィ・ハズ・ランデッド―",
						romaji: null,
					},
				];
			}
			if (sql.includes("FROM book_title WHERE book_id = $1")) {
				return [
					{
						book_id: RNDB_BOOK_ID,
						lang: "ja",
						title: "86―エイティシックス―Ep.9 ―ヴァルキリィ・ハズ・ランデッド―",
						romaji: "86 Eighty-Six Ep. 9 Valkyrie Has Landed",
					},
				];
			}
			if (sql.includes("JOIN series_title st ON st.series_id = sb.series_id")) {
				return [
					{
						title: "86―エイティシックス―",
						romaji: "86 Eighty-Six",
						sort_order: 9,
						aliases: null,
					},
				];
			}
			if (sql.includes("book_staff_alias")) {
				return [
					{
						book_id: RNDB_BOOK_ID,
						name: "安里アサト",
						romaji: "Asato Asato",
						role_type: "author",
					},
				];
			}
			return metadataHandler(sql);
		};

		const { metadata: result } = await ranobedbProvider.getMetadata({
			title: "86─エイティシックス─Ep.9 ─ヴァルキリィ・ハズ・ランデッド─",
			authors: [{ name: "安里アサト" }],
		});

		expect(result.series).toEqual({
			name: "86―エイティシックス―",
			position: 9,
			aliases: ["86 Eighty-Six"],
		});
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

		const { metadata: result } = await ranobedbProvider.getMetadata({
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

		const { metadata: result } = await ranobedbProvider.getMetadata({
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

		const { metadata: result } = await ranobedbProvider.getMetadata({
			title:
				"ガガガ文庫 やはり俺の青春ラブコメはまちがっている。9（イラスト完全版）",
		});
		expect(seenPatterns[1]).toBe("%やはり俺の青春ラブコメはまちがっている%9%");
		expect(result.title).toBe("アクセル・ワールド12");
	});

	test("series position uses canonical sort_order instead of a decimal volume label", async () => {
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
				// The title keeps the editorial label while position represents the
				// canonical reading order across the whole series.
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

		const { metadata: result } = await ranobedbProvider.getMetadata({
			isbn13: "9784094530049",
		});
		expect(result.title).toBe("やはり俺の青春ラブコメはまちがっている。14.5");
		expect(result.series?.position).toBe(18);
	});

	test("series position keeps global order when an arc restarts at volume one", async () => {
		queryHandler = (sql) => {
			if (sql.includes("isbn13 = $1")) return [{ book_id: RNDB_BOOK_ID }];
			if (sql.includes("FROM book_title WHERE book_id = $1")) {
				return [
					{
						book_id: RNDB_BOOK_ID,
						lang: "ja",
						title: "ようこそ実力至上主義の教室へ 2年生編3",
						romaji: null,
					},
				];
			}
			if (sql.includes("JOIN series_title st ON st.series_id = sb.series_id")) {
				return [
					{
						title: "ようこそ実力至上主義の教室へ",
						romaji: null,
						sort_order: 17,
					},
				];
			}
			return metadataHandler(sql);
		};

		const { metadata: result } = await ranobedbProvider.getMetadata({
			isbn13: "9784040659428",
		});
		expect(result.series?.position).toBe(17);
	});

	test("series position does not mistake a trailing arc numeral for the volume", async () => {
		queryHandler = (sql) => {
			if (sql.includes("isbn13 = $1")) return [{ book_id: RNDB_BOOK_ID }];
			if (sql.includes("FROM book_title WHERE book_id = $1")) {
				return [
					{
						book_id: RNDB_BOOK_ID,
						lang: "ja",
						title: "ソードアート・オンライン23 ユナイタル・リングII",
						romaji: null,
					},
				];
			}
			if (sql.includes("JOIN series_title st ON st.series_id = sb.series_id")) {
				return [
					{
						title: "ソードアート・オンライン",
						romaji: null,
						sort_order: 23,
					},
				];
			}
			return metadataHandler(sql);
		};

		const { metadata: result } = await ranobedbProvider.getMetadata({
			isbn13: "9784049128918",
		});
		expect(result.series?.position).toBe(23);
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

		const { metadata: result } = await ranobedbProvider.getMetadata({
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

		const { metadata: result } = await ranobedbProvider.getMetadata({
			isbn13: "9784000000000",
		});
		expect(result.publishedDate).toBe("2024-03-15");
	});
});

// ─── Manual fix-match ────────────────────────────────────

// toCandidate's per-book queries (author-only staff, series, release dates).
function candidateHandler(sql: string): unknown[] | null {
	if (sql.includes("role_type = 'author'")) {
		return [{ name: "川原礫", romaji: "Kawahara Reki", role_type: "author" }];
	}
	if (sql.includes("JOIN series_title st ON st.series_id = sb.series_id")) {
		return [
			{ title: "アクセル・ワールド", romaji: "Accel World", sort_order: 12 },
		];
	}
	if (sql.includes("SELECT r.release_date")) {
		return [{ release_date: 20130810 }];
	}
	return null;
}

describe("search (manual fix-match)", () => {
	test("returns ranked candidates, exact title first", async () => {
		queryHandler = (sql) => {
			if (sql.includes("JOIN book b ON")) {
				return [
					{
						book_id: 1111,
						title: "アクセル・ワールド11",
						romaji: "Accel World 11",
						image_filename: null,
					},
					{
						book_id: RNDB_BOOK_ID,
						title: "アクセル・ワールド12",
						romaji: "Accel World 12",
						image_filename: "abc123.jpg",
					},
				];
			}
			return candidateHandler(sql);
		};

		const results = await ranobedbProvider.search({
			title: "アクセル・ワールド12",
		});

		expect(results.length).toBe(2);
		expect(results[0]).toMatchObject({
			provider: "ranobedb",
			providerId: String(RNDB_BOOK_ID),
			title: "アクセル・ワールド12",
			titleRomaji: "Accel World 12",
			authors: [{ name: "川原礫" }],
			series: { name: "アクセル・ワールド", position: 12 },
			publishedDate: "2013-08-10",
			previewCover: "https://images.ranobedb.org/abc123.jpg",
			url: `https://ranobedb.org/book/${RNDB_BOOK_ID}`,
		});
		// No image in the dump → no preview, but the page link is always there.
		expect(results[1]?.previewCover).toBeNull();
		expect(results[1]?.url).toBe("https://ranobedb.org/book/1111");
	});

	test("ranks the matching Unicode Roman volume first", async () => {
		queryHandler = (sql) => {
			if (sql.includes("JOIN book b ON")) {
				return [
					{
						book_id: 14185,
						title: "本好きの下剋上 第一部「兵士の娘I」",
						romaji: null,
						image_filename: null,
					},
					{
						book_id: 14359,
						title: "本好きの下剋上 第一部「兵士の娘II」",
						romaji: null,
						image_filename: null,
					},
					{
						book_id: 15173,
						title: "本好きの下剋上 第一部「兵士の娘III」",
						romaji: null,
						image_filename: null,
					},
				];
			}
			return candidateHandler(sql);
		};

		const results = await ranobedbProvider.search({
			title: "本好きの下剋上 第一部 兵士の娘Ⅲ",
		});

		expect(results[0]?.providerId).toBe("15173");
	});

	test("dedupes rows sharing a book id", async () => {
		queryHandler = (sql) => {
			if (sql.includes("JOIN book b ON")) {
				return [
					{ book_id: RNDB_BOOK_ID, title: "タイトルA", romaji: null },
					{ book_id: RNDB_BOOK_ID, title: "タイトルA 完全版", romaji: null },
				];
			}
			return candidateHandler(sql);
		};

		const results = await ranobedbProvider.search({ title: "タイトルA" });
		expect(results.length).toBe(1);
	});

	test("returns [] without a title or when the db is unavailable", async () => {
		expect(await ranobedbProvider.search({})).toEqual([]);
		expect(await ranobedbProvider.search({ title: "何か" })).toEqual([]);
	});
});

describe("getById (manual fix-match)", () => {
	test("builds the full record from a RanobeDB book id", async () => {
		queryHandler = metadataHandler;

		const result = await ranobedbProvider.getById(String(RNDB_BOOK_ID));

		expect(result?.title).toBe("アクセル・ワールド12");
		expect(result?.authors?.[0]?.name).toBe("川原礫");
		expect(result?.series).toEqual({
			name: "アクセル・ワールド",
			position: 12,
			aliases: ["Accel World", "AW"],
		});
	});

	test("emits an empty alias list when the matched series has none", async () => {
		queryHandler = (sql) => {
			if (sql.includes("JOIN series_title st ON st.series_id = sb.series_id")) {
				return [
					{
						title: "単巻",
						romaji: null,
						sort_order: 1,
						aliases: null,
					},
				];
			}
			return metadataHandler(sql);
		};

		const result = await ranobedbProvider.getById(String(RNDB_BOOK_ID));
		expect(result?.series?.aliases).toEqual([]);
	});

	test("returns null for a non-numeric id or missing book", async () => {
		expect(await ranobedbProvider.getById("not-a-number")).toBeNull();
		expect(await ranobedbProvider.getById("999999")).toBeNull();
	});
});
