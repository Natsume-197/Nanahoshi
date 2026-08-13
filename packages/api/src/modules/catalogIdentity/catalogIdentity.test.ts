import { describe, expect, test } from "bun:test";
import {
	assessCatalogIdentity,
	assessGroupMembership,
	type CatalogIdentityEvidence,
	isSupplementalCatalogTitle,
	CATALOG_IDENTITY_REASONS as R,
} from ".";

const book = (
	title: string | null,
	extra: Partial<CatalogIdentityEvidence> = {},
): CatalogIdentityEvidence => ({ kind: "book", title, ...extra });

describe("catalogIdentity: written books", () => {
	test("uses a provider-scoped confirmed match as identifier evidence", () => {
		const providerId = {
			scheme: "providerEdition" as const,
			value: '["ranobedb","17860"]',
		};
		expect(
			assessCatalogIdentity(
				book("化物語（上）", { identifiers: [providerId] }),
				book("化物語 上", { identifiers: [providerId] }),
			),
		).toMatchObject({ status: "confirmed" });
		expect(
			assessCatalogIdentity(
				book("化物語（上）", { identifiers: [providerId] }),
				book("化物語（下）", { identifiers: [providerId] }),
			),
		).toMatchObject({ status: "rejected" });
	});

	test("an unnumbered title and volume 1 can be the same Logical Edition", () => {
		expect(
			assessCatalogIdentity(
				book("Konosuba", { authors: ["Natsume Akatsuki"] }),
				book("Konosuba 1", { authors: ["Natsume Akatsuki"] }),
			),
		).toEqual({
			status: "confirmed",
			reasons: [R.TITLE_MATCH, R.TITLE_EQUIVALENT, R.AUTHOR_MATCH],
		});
	});

	test("an unnumbered title and volume 2 are rejected", () => {
		expect(assessCatalogIdentity(book("Konosuba"), book("Konosuba 2"))).toEqual(
			{ status: "rejected", reasons: [R.VOLUME_CONFLICT] },
		);
	});

	test("conflicting structural parts are different volumes", () => {
		expect(
			assessCatalogIdentity(book("物語 上巻"), book("物語（下）")),
		).toEqual({ status: "rejected", reasons: [R.PART_CONFLICT] });
		expect(assessCatalogIdentity(book("物語 上"), book("物語 前編"))).toEqual({
			status: "rejected",
			reasons: [R.PART_CONFLICT],
		});
	});

	test("retains numbered part and volume as independent discriminators", () => {
		expect(
			assessCatalogIdentity(
				book("Chronicle Part 2 Volume 3"),
				book("Chronicle Part 1 Volume 3"),
			),
		).toEqual({ status: "rejected", reasons: [R.PART_CONFLICT] });
		expect(
			assessCatalogIdentity(
				book("Chronicle Part 2 Volume 3"),
				book("Chronicle Part 2 Volume 4"),
			),
		).toEqual({ status: "rejected", reasons: [R.VOLUME_CONFLICT] });
	});

	test("a record with no title proves nothing, even against a numbered volume", () => {
		// Search evidence can be an identifier alone; absent evidence must not be
		// read as an unnumbered first volume and veto the match.
		expect(
			assessCatalogIdentity(
				{ kind: "book", asin: "B0DW7HYGH2" },
				book("転生王女と天才令嬢の魔法革命10", { asin: "B0DW7HYGH2" }),
			),
		).toEqual({ status: "indeterminate", reasons: [R.TITLE_MISSING] });
	});

	test("a present structural part versus a missing one is indeterminate", () => {
		expect(
			assessCatalogIdentity(
				book("物語 上巻", { isbn13: "9780306406157" }),
				book("物語", { isbn10: "0306406152" }),
			),
		).toEqual({ status: "indeterminate", reasons: [R.PART_MISSING] });
	});

	test("supplements and content editions veto a main edition", () => {
		expect(
			assessCatalogIdentity(
				book("本好きの下剋上"),
				book("本好きの下剋上 ふぁんぶっく"),
			),
		).toEqual({ status: "rejected", reasons: [R.SUPPLEMENT_CONFLICT] });
		expect(assessCatalogIdentity(book("斜陽"), book("斜陽 新訳"))).toEqual({
			status: "rejected",
			reasons: [R.CONTENT_EDITION_CONFLICT],
		});
		expect(
			assessCatalogIdentity(
				book("この素晴らしい世界に祝福を！"),
				book("この素晴らしい世界に祝福を！ よりみち"),
			),
		).toEqual({ status: "rejected", reasons: [R.SUPPLEMENT_CONFLICT] });
		expect(isSupplementalCatalogTitle("本好きの下剋上 短編集1")).toBe(true);
		expect(isSupplementalCatalogTitle("本好きの下剋上 第一部")).toBe(false);
	});

	test("different supplemental publications do not collapse to their shared franchise", () => {
		expect(
			assessCatalogIdentity(
				book("この素晴らしい世界に祝福を！ めぐみんアンソロジー 紅Aka", {
					authors: ["暁なつめ", "三嶋くろね"],
				}),
				book("この素晴らしい世界に祝福を！ よりみち！", {
					authors: ["暁なつめ", "三嶋くろね"],
				}),
			),
		).toEqual({ status: "rejected", reasons: [R.SUPPLEMENT_CONFLICT] });
		expect(
			assessCatalogIdentity(
				book("この素晴らしい世界に祝福を！ めぐみんアンソロジー", {
					authors: ["暁なつめ"],
					isbn13: "9784041085219",
				}),
				book("この素晴らしい世界に祝福を！ めぐみんアンソロジー 紅Aka", {
					authors: ["暁なつめ"],
					isbn13: "9784041085219",
				}),
			),
		).toEqual({ status: "rejected", reasons: [R.TITLE_CONFLICT] });
	});

	test("a recurring series tagline may be omitted from one supplemental title", () => {
		expect(
			assessCatalogIdentity(
				book(
					"本好きの下剋上 〜司書になるためには手段を選んでいられません〜 ふぁんぶっく",
					{ authors: ["香月美夜"] },
				),
				book("本好きの下剋上ふぁんぶっく", {
					authors: ["香月美夜"],
				}),
			).status,
		).toBe("confirmed");
	});

	test("different explicit supplemental taglines remain distinct", () => {
		expect(
			assessCatalogIdentity(
				book("作品 〜設定資料〜 ふぁんぶっく", { authors: ["同じ著者"] }),
				book("作品 〜人物資料〜 ふぁんぶっく", { authors: ["同じ著者"] }),
			).status,
		).toBe("rejected");
	});

	test("an omitted tagline never erases supplemental kind or volume conflicts", () => {
		expect(
			assessCatalogIdentity(
				book(
					"本好きの下剋上 〜司書になるためには手段を選んでいられません〜 ふぁんぶっく",
				),
				book("本好きの下剋上ふぁんぶっく2"),
			),
		).toEqual({ status: "rejected", reasons: [R.VOLUME_CONFLICT] });
		expect(
			assessCatalogIdentity(
				book(
					"本好きの下剋上 〜司書になるためには手段を選んでいられません〜 ふぁんぶっく",
				),
				book("本好きの下剋上 短編集"),
			),
		).toEqual({ status: "rejected", reasons: [R.SUPPLEMENT_CONFLICT] });
	});

	test.each([
		["斜陽", "斜陽の国のルスダン", "太宰治", "並木陽"],
		["青年", "家出青年、猫ホストになる", "森鴎外", "水月さなぎ"],
		["オセロ", "オセロ", "藤原チコ", "別の著者"],
	] as const)(
		"rejects known automatic false positive %s → %s",
		(leftTitle, rightTitle, leftAuthor, rightAuthor) => {
			expect(
				assessCatalogIdentity(
					book(leftTitle, { authors: [leftAuthor] }),
					book(rightTitle, { authors: [rightAuthor] }),
				).status,
			).toBe("rejected");
		},
	);

	test("distinguishing Japanese subtitles beat shared packaging noise", () => {
		const label = "「涼宮ハルヒ」シリーズ (角川スニーカー文庫)";
		expect(
			assessCatalogIdentity(
				book(`涼宮ハルヒの憤慨 ${label}`),
				book(`涼宮ハルヒの憂鬱 ${label}`),
			).status,
		).toBe("rejected");
	});

	test("packaging and new-cover labels are neutral", () => {
		expect(
			assessCatalogIdentity(
				book("斜陽", { authors: ["太宰治"] }),
				book("斜陽 新装版 Kindle限定", { authors: ["太宰治"] }),
			).status,
		).toBe("confirmed");
		expect(
			assessCatalogIdentity(
				book(
					"ガガガ文庫 やはり俺の青春ラブコメはまちがっている。9（イラスト完全版）",
				),
				book("やはり俺の青春ラブコメはまちがっている。9"),
			).status,
		).toBe("indeterminate");
	});

	test("decorative dash variants do not change book identity", () => {
		expect(
			assessCatalogIdentity(
				book("86─エイティシックス─Ep.9 ─ヴァルキリィ・ハズ・ランデッド─", {
					authors: ["安里アサト"],
				}),
				book("86―エイティシックス―Ep.9 ―ヴァルキリィ・ハズ・ランデッド―", {
					authors: ["安里アサト"],
				}),
			).status,
		).toBe("confirmed");
	});

	test("title alone remains indeterminate", () => {
		expect(assessCatalogIdentity(book("斜陽"), book("斜陽"))).toEqual({
			status: "indeterminate",
			reasons: [R.TITLE_MATCH, R.TITLE_ONLY],
		});
	});

	test("a compatible author corroborates the title", () => {
		expect(
			assessCatalogIdentity(
				book("斜陽", { authors: ["太宰 治"] }),
				book("斜陽", { creators: [{ name: "太宰治", role: "Author" }] }),
			).status,
		).toBe("confirmed");
	});

	test("illustrators and unknown creator roles do not establish authorship", () => {
		expect(
			assessCatalogIdentity(
				book("斜陽", { creators: [{ name: "同じ人", role: "Illustrator" }] }),
				book("斜陽", { creators: [{ name: "同じ人" }] }),
			).status,
		).toBe("indeterminate");
	});

	test("matching ISBN-10/13 corroborates a compatible title", () => {
		const verdict = assessCatalogIdentity(
			book("Physics", { isbn10: "0-306-40615-2" }),
			book("Physics", { isbn13: "9780306406157" }),
		);
		expect(verdict).toEqual({
			status: "confirmed",
			reasons: [R.TITLE_MATCH, R.TITLE_EQUIVALENT, R.IDENTIFIER_MATCH],
		});
	});

	test("a matching identifier never overrides a title or language veto", () => {
		expect(
			assessCatalogIdentity(
				book("Konosuba 1", { asin: "B07NRCPYW6" }),
				book("Konosuba 2", { asin: "B07NRCPYW6" }),
			).status,
		).toBe("rejected");
		expect(
			assessCatalogIdentity(
				book("Konosuba", { asin: "B07NRCPYW6", languageCode: "ja" }),
				book("Konosuba", { asin: "B07NRCPYW6", languageCode: "en" }),
			).reasons,
		).toEqual([R.LANGUAGE_CONFLICT]);
	});

	test("matching identifier plus conflicting authors is indeterminate", () => {
		expect(
			assessCatalogIdentity(
				book("Othello", { asin: "B07NRCPYW6", authors: ["Author A"] }),
				book("Othello", { asin: "B07NRCPYW6", authors: ["Author B"] }),
			).status,
		).toBe("indeterminate");
	});

	test("a qualified embedded uid corroborates but a reused uid does not", () => {
		const qualified = book("LoveR", {
			embeddedUid: "BW-000123456",
			embeddedUidOccurrenceCount: 2,
		});
		expect(assessCatalogIdentity(qualified, qualified).status).toBe(
			"confirmed",
		);
		const reused = book("LoveR", {
			embeddedUid: "BW-000123456",
			embeddedUidOccurrenceCount: 9,
		});
		expect(assessCatalogIdentity(reused, reused).status).toBe("indeterminate");
	});

	test("contradictory title roles are indeterminate", () => {
		expect(
			assessCatalogIdentity(
				book(null, { title: "Konosuba 1", titleRomaji: "Konosuba 2" }),
				book("Konosuba 1"),
			),
		).toEqual({
			status: "indeterminate",
			reasons: [R.INTERNAL_DISCRIMINATOR_CONFLICT],
		});
	});

	test("comparison is symmetric", () => {
		const a = book("Konosuba", { authors: ["Natsume Akatsuki"] });
		const b = book("Konosuba 1", { authors: ["Natsume Akatsuki"] });
		expect(assessCatalogIdentity(a, b)).toEqual(assessCatalogIdentity(b, a));
	});
});

describe("catalogIdentity: audiobook quick match", () => {
	test("title alone can confirm and duration differences only annotate", () => {
		const verdict = assessCatalogIdentity(
			{ kind: "audiobook", title: "Great Story", duration: 3600 },
			{ kind: "audiobook", title: "Great Story", duration: 4800 },
		);
		expect(verdict).toEqual({
			status: "confirmed",
			reasons: [R.AUDIO_TITLE_MATCH, R.AUDIO_DURATION_FAR],
		});
	});

	test("a valid shared ASIN confirms directly", () => {
		expect(
			assessCatalogIdentity(
				{ kind: "audiobook", asin: "B07NRCPYW6" },
				{ kind: "audiobook", asin: "b07nrcpyw6" },
			),
		).toEqual({ status: "confirmed", reasons: [R.AUDIO_ASIN_MATCH] });
	});
});

describe("assessGroupMembership", () => {
	test("requires one confirmed member and no rejected member", () => {
		const candidate = book("Konosuba", { authors: ["Natsume Akatsuki"] });
		expect(
			assessGroupMembership(candidate, [
				book("Konosuba 1", { authors: ["Natsume Akatsuki"] }),
				book("Konosuba"),
			]).status,
		).toBe("confirmed");
		expect(
			assessGroupMembership(candidate, [
				book("Konosuba 1", { authors: ["Natsume Akatsuki"] }),
				book("Konosuba 2"),
			]).status,
		).toBe("rejected");
	});
});
