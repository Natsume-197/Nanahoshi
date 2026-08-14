import { describe, expect, test } from "bun:test";
import {
	assessCatalogIdentity,
	assessGroupMembership,
	buildDiscoveryProjection,
	type CatalogIdentityEvidence,
	isSupplementalCatalogTitle,
	CATALOG_IDENTITY_REASONS as R,
} from ".";
import { CATALOG_IDENTITY_REGRESSION_CORPUS } from "./regression-corpus";

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

	test("an unnumbered title and volume 1 can be the same catalog identity", () => {
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

	test("an exact numeric title remains a title rather than an empty volume base", () => {
		expect(
			assessCatalogIdentity(
				book("1984", { authors: ["George Orwell"] }),
				book("1984", { authors: ["George Orwell"] }),
			),
		).toEqual({
			status: "confirmed",
			reasons: [R.TITLE_MATCH, R.TITLE_EQUIVALENT, R.AUTHOR_MATCH],
		});
		expect(
			assessCatalogIdentity(
				book("1984", { authors: ["George Orwell"] }),
				book("1985", { authors: ["George Orwell"] }),
			),
		).toEqual({ status: "rejected", reasons: [R.VOLUME_CONFLICT] });
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

	test("a repeated unnumbered title never erases the retained volume", () => {
		expect(
			assessCatalogIdentity(
				book(
					"やはり俺の青春ラブコメはまちがっている。6 ガガガ文庫 やはり俺の青春ラブコメはまちがっている",
					{ authors: ["渡航"] },
				),
				book("やはり俺の青春ラブコメはまちがっている。7", {
					authors: ["渡航"],
				}),
			),
		).toEqual({ status: "rejected", reasons: [R.VOLUME_CONFLICT] });
	});

	test.each(["新訳", "上巻", "ふぁんぶっく"])(
		"discovery cleanup never erases the %s identity discriminator",
		(discriminator) => {
			const local = book(`作品 6 作品 ${discriminator}`, {
				authors: ["著者"],
			});
			const candidate = book("作品 6", { authors: ["著者"] });

			expect(assessCatalogIdentity(local, candidate).status).not.toBe(
				"confirmed",
			);
			expect(buildDiscoveryProjection(local)[0]).toEqual(local);
		},
	);

	test("combines a volume and content edition carried by repeated English title forms", () => {
		const repeated = book("The Story 6 The Story Revised Edition", {
			authors: ["Same Author"],
		});
		expect(
			assessCatalogIdentity(
				repeated,
				book("The Story 6 Revised Edition", { authors: ["Same Author"] }),
			),
		).toEqual({
			status: "confirmed",
			reasons: [R.TITLE_MATCH, R.TITLE_EQUIVALENT, R.AUTHOR_MATCH],
		});
		expect(
			assessCatalogIdentity(
				repeated,
				book("The Story 6", {
					authors: ["Same Author"],
				}),
			),
		).toEqual({
			status: "rejected",
			reasons: [R.CONTENT_EDITION_CONFLICT],
		});
	});

	test("interprets repeated Spanish content-edition evidence", () => {
		const repeated = book("La historia 6 La historia edición revisada", {
			authors: ["Misma autora"],
		});
		expect(
			assessCatalogIdentity(
				repeated,
				book("La historia 6 edición revisada", {
					authors: ["Misma autora"],
				}),
			),
		).toEqual({
			status: "confirmed",
			reasons: [R.TITLE_MATCH, R.TITLE_EQUIVALENT, R.AUTHOR_MATCH],
		});
		expect(
			assessCatalogIdentity(
				repeated,
				book("La historia 6", {
					authors: ["Misma autora"],
				}),
			),
		).toEqual({
			status: "rejected",
			reasons: [R.CONTENT_EDITION_CONFLICT],
		});
	});

	test.each(["edición completa", "edición ampliada", "nueva traducción"])(
		"interprets the Spanish content edition %s",
		(edition) => {
			expect(
				assessCatalogIdentity(
					book(`La historia 6 La historia ${edition}`, {
						authors: ["Misma autora"],
					}),
					book(`La historia 6 ${edition}`, { authors: ["Misma autora"] }),
				),
			).toEqual({
				status: "confirmed",
				reasons: [R.TITLE_MATCH, R.TITLE_EQUIVALENT, R.AUTHOR_MATCH],
			});
		},
	);

	test.each([
		["English volume", "The Story Volume 6 The Story", "The Story Volume 6"],
		[
			"Spanish volume",
			"La historia volumen 6 La historia",
			"La historia volumen 6",
		],
		["Spanish tome", "La historia tomo 6 La historia", "La historia tomo 6"],
	])("interprets a repeated %s marker", (_label, repeated, canonical) => {
		expect(
			assessCatalogIdentity(
				book(repeated, { authors: ["Same Author"] }),
				book(canonical, { authors: ["Same Author"] }),
			),
		).toEqual({
			status: "confirmed",
			reasons: [R.TITLE_MATCH, R.TITLE_EQUIVALENT, R.AUTHOR_MATCH],
		});
	});

	test.each([
		["English part", "The Story Part 6 The Story", "The Story Part 6"],
		["English book", "The Story Book 6 The Story", "The Story Book 6"],
		["Spanish part", "La historia parte 6 La historia", "La historia parte 6"],
		["Spanish book", "La historia libro 6 La historia", "La historia libro 6"],
	])("interprets a repeated %s marker", (_label, repeated, canonical) => {
		expect(
			assessCatalogIdentity(
				book(repeated, { authors: ["Misma autora"] }),
				book(canonical, { authors: ["Misma autora"] }),
			),
		).toEqual({
			status: "confirmed",
			reasons: [R.TITLE_MATCH, R.TITLE_EQUIVALENT, R.AUTHOR_MATCH],
		});
	});

	test("interprets a repeated Spanish supplemental release", () => {
		const anthology = book("La historia 1 La historia antología", {
			authors: ["Misma autora"],
		});
		expect(
			assessCatalogIdentity(
				anthology,
				book("La historia 1 antología", { authors: ["Misma autora"] }),
			),
		).toEqual({
			status: "confirmed",
			reasons: [R.TITLE_MATCH, R.TITLE_EQUIVALENT, R.AUTHOR_MATCH],
		});
		expect(
			assessCatalogIdentity(
				anthology,
				book("La historia 1", {
					authors: ["Misma autora"],
				}),
			),
		).toEqual({
			status: "rejected",
			reasons: [R.SUPPLEMENT_CONFLICT],
		});
	});
});

describe("catalogIdentity: production regression corpus", () => {
	test.each(CATALOG_IDENTITY_REGRESSION_CORPUS)(
		"keeps $name fixed",
		({ left, right, expected }) => {
			expect(assessCatalogIdentity(left, right).status).toBe(expected);
		},
	);
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

describe("buildDiscoveryProjection", () => {
	const discoveryRegressions = CATALOG_IDENTITY_REGRESSION_CORPUS.filter(
		(entry): entry is typeof entry & { expectedDiscoveryTitle: string } =>
			"expectedDiscoveryTitle" in entry,
	);

	test.each(discoveryRegressions)(
		"derives the clean title for $name",
		({ left, expectedDiscoveryTitle }) => {
			expect(
				buildDiscoveryProjection(left).map(({ title }) => title),
			).toContain(expectedDiscoveryTitle);
		},
	);

	test("keeps raw evidence first and derives bounded conservative search forms", () => {
		const raw = book(
			"ガガガ文庫 やはり俺の青春ラブコメはまちがっている。9（イラスト完全版）",
			{ authors: ["渡航 / ぽんかん⑧"] },
		);

		expect(buildDiscoveryProjection(raw)).toEqual([
			raw,
			book("やはり俺の青春ラブコメはまちがっている。9", {
				authors: ["渡航 / ぽんかん⑧"],
			}),
			book(
				"ガガガ文庫 やはり俺の青春ラブコメはまちがっている。9（イラスト完全版）",
				{ authors: ["渡航", "ぽんかん⑧"] },
			),
			book("やはり俺の青春ラブコメはまちがっている。9", {
				authors: ["渡航", "ぽんかん⑧"],
			}),
		]);
	});
});
