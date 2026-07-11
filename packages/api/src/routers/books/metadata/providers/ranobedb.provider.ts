import { queryRanobedb } from "../../../../infrastructure/ranobedb/ranobedb.client";
import { logger } from "../../../../lib/logger";
import { getRanobedbConfig } from "../../../settings/settings.service";
import type { BookMetadata } from "../book.metadata.model";
import type {
	BookSearchCandidate,
	ISearchableMetadataProvider,
} from "./IMetadata.provider";
import {
	cleanSearchTerm,
	extractTrailingVolume,
	extractVolumeNumber,
	isTitleSimilar,
	normalizeForComparison,
} from "./title-match";

const log = logger.child({ component: "ranobedb-provider" });

// Queries target the locally imported RanobeDB dump (separate `ranobedb` db).
// Its schema isn't a stable API, so all SQL lives here; queryRanobedb fails soft.

const ASIN_PATTERN = /\/dp\/([A-Z0-9]{10})/i;

const SEARCH_RESULT_LIMIT = 8;

const RANOBEDB_BOOK_URL = "https://ranobedb.org/book/";
const RANOBEDB_IMAGE_CDN = "https://images.ranobedb.org/";

// RanobeDB staff_role enum → display roles used by Amazon provider
const ROLE_MAP: Record<string, string> = {
	author: "Author",
	artist: "Illustrator",
	editor: "Editor",
	translator: "Translator",
	narrator: "Narrator",
	staff: "Staff",
};

type BookRow = {
	id: number;
	description: string;
	description_ja: string;
	olang: string;
};

type TitleRow = {
	book_id: number;
	title: string;
	romaji: string | null;
};

type SearchTitleRow = TitleRow & { image_filename: string | null };

type ReleaseRow = {
	release_date: number;
	pages: number | null;
	format: string;
	lang: string;
	isbn13: string | null;
	amazon: string | null;
	rtype: string;
};

type SeriesRow = {
	title: string;
	romaji: string | null;
	sort_order: number;
};

type StaffRow = {
	name: string;
	romaji: string | null;
	role_type: string;
};

type PublisherRow = { name: string };

type GenreRow = { name: string };

class RanobedbProvider implements ISearchableMetadataProvider {
	// Manual fix-match search: same LIKE pre-filter as the automatic lookup but
	// returning the ranked candidates instead of silently picking one.
	async search(input: {
		title?: string;
		author?: string;
	}): Promise<BookSearchCandidate[]> {
		try {
			const title = input.title?.trim();
			if (!title) return [];

			const stripped = this.stripTitleNoise(title);
			const cleaned = cleanSearchTerm(stripped);
			if (!cleaned) return [];

			const pattern = this.toLikePattern(cleaned);
			if (!pattern) return [];
			let rows = await this.querySearchRows(pattern);

			// Relaxed retry with the longest token, mirroring resolveByTitle.
			if (rows.length === 0) {
				const relaxed = this.toRelaxedPattern(
					cleaned,
					extractVolumeNumber(stripped),
				);
				if (relaxed && relaxed !== pattern) {
					rows = await this.querySearchRows(relaxed);
				}
			}
			if (rows.length === 0) return [];

			// Dedupe by book, rank by closeness to the input title.
			const normalizedInput = normalizeForComparison(stripped);
			const byBook = new Map<number, SearchTitleRow>();
			for (const row of rows) {
				if (!byBook.has(row.book_id)) byBook.set(row.book_id, row);
			}
			const ranked = [...byBook.values()].sort((a, b) => {
				const distance = (row: SearchTitleRow) => {
					const texts = [row.title, row.romaji].filter((t): t is string => !!t);
					return Math.min(
						...texts.map((t) => {
							const normalized = normalizeForComparison(t);
							const contains = normalized.includes(normalizedInput) ? 0 : 1000;
							return (
								contains + Math.abs(normalized.length - normalizedInput.length)
							);
						}),
					);
				};
				return distance(a) - distance(b);
			});

			const top = ranked.slice(0, SEARCH_RESULT_LIMIT);
			return await Promise.all(top.map((row) => this.toCandidate(row)));
		} catch (error) {
			log.warn({ err: error }, "Search failed");
			return [];
		}
	}

	private async querySearchRows(pattern: string): Promise<SearchTitleRow[]> {
		const rows = await queryRanobedb<SearchTitleRow>(
			`SELECT bt.book_id, bt.title, bt.romaji, i.filename AS image_filename
			 FROM book_title bt
			 JOIN book b ON b.id = bt.book_id
			 LEFT JOIN image i ON i.id = b.image_id
			 WHERE b.hidden = false
			   AND (bt.title ILIKE $1 OR bt.romaji ILIKE $1)
			 LIMIT 50`,
			[pattern],
		);
		return rows ?? [];
	}

	private async toCandidate(row: SearchTitleRow): Promise<BookSearchCandidate> {
		const [staffRows, seriesRows, releaseRows] = await Promise.all([
			queryRanobedb<StaffRow>(
				`SELECT sa.name, sa.romaji, bsa.role_type
				 FROM book_staff_alias bsa
				 JOIN staff_alias sa ON sa.id = bsa.staff_alias_id
				 WHERE bsa.book_id = $1 AND bsa.eid = 0 AND bsa.role_type = 'author'`,
				[row.book_id],
			),
			queryRanobedb<SeriesRow>(
				`SELECT st.title, st.romaji, sb.sort_order
				 FROM series_book sb
				 JOIN series_title st ON st.series_id = sb.series_id AND st.official = true
				 WHERE sb.book_id = $1
				 LIMIT 1`,
				[row.book_id],
			),
			queryRanobedb<{ release_date: number }>(
				`SELECT r.release_date
				 FROM release r
				 JOIN release_book rb ON rb.release_id = r.id
				 WHERE rb.book_id = $1 AND r.hidden = false
				 ORDER BY r.release_date ASC`,
				[row.book_id],
			),
		]);

		const authors = (staffRows ?? []).map((s) => ({ name: s.name }));
		const series = seriesRows?.[0];
		return {
			provider: "ranobedb",
			providerId: String(row.book_id),
			title: row.title,
			titleRomaji: row.romaji,
			authors: authors.length > 0 ? authors : undefined,
			series: series
				? { name: series.title, position: series.sort_order ?? null }
				: null,
			publishedDate: this.parseReleaseDate(
				(releaseRows ?? []).map((r) => r.release_date),
			),
			previewCover: row.image_filename
				? `${RANOBEDB_IMAGE_CDN}${row.image_filename}`
				: null,
			url: `${RANOBEDB_BOOK_URL}${row.book_id}`,
		};
	}

	// Manual fix-match apply: full record straight from a RanobeDB book id.
	async getById(providerId: string): Promise<Partial<BookMetadata> | null> {
		const rndbBookId = Number.parseInt(providerId, 10);
		if (!Number.isFinite(rndbBookId)) return null;
		try {
			const metadata = await this.buildMetadata(rndbBookId, {});
			return Object.keys(metadata).length > 0 ? metadata : null;
		} catch (error) {
			log.warn({ err: error, rndbBookId }, "getById failed");
			return null;
		}
	}

	async getMetadata(
		input: Partial<BookMetadata> & {
			bookId?: number;
			uuid?: string;
			serverId?: string | null;
		},
	): Promise<Partial<BookMetadata>> {
		try {
			// Library-less books have no organization → default to enabled.
			if (input.serverId) {
				const config = await getRanobedbConfig(input.serverId);
				if (!config.enabled) return {};
			}

			const rndbBookId = await this.resolveBookId(input);
			if (rndbBookId == null) return {};

			return await this.buildMetadata(rndbBookId, input);
		} catch (error) {
			log.warn({ err: error }, "Error fetching metadata");
			return {};
		}
	}

	// ─── Lookup ──────────────────────────────────────────

	private async resolveBookId(
		input: Partial<BookMetadata>,
	): Promise<number | null> {
		const isbn = input.isbn13;
		if (isbn) {
			const rows = await queryRanobedb<{ book_id: number }>(
				`SELECT rb.book_id
				 FROM release r
				 JOIN release_book rb ON rb.release_id = r.id
				 WHERE r.isbn13 = $1 AND r.hidden = false
				 LIMIT 1`,
				[isbn],
			);
			if (rows?.[0]) return rows[0].book_id;
			if (rows === null) return null;
		}

		if (input.asin) {
			const rows = await queryRanobedb<{ book_id: number }>(
				`SELECT rb.book_id
				 FROM release r
				 JOIN release_book rb ON rb.release_id = r.id
				 WHERE r.amazon LIKE '%/dp/' || $1 || '%' AND r.hidden = false
				 LIMIT 1`,
				[input.asin],
			);
			if (rows?.[0]) return rows[0].book_id;
			if (rows === null) return null;
		}

		if (input.title) {
			return await this.resolveByTitle(input.title);
		}

		return null;
	}

	private async resolveByTitle(title: string): Promise<number | null> {
		const stripped = this.stripTitleNoise(title);
		const cleaned = cleanSearchTerm(stripped);
		if (!cleaned) return null;

		const volume = extractVolumeNumber(stripped);
		const normalizedInput = normalizeForComparison(stripped);

		// SQL pre-filter: wildcards between letter/digit runs; precise matching
		// happens in JS.
		const pattern = this.toLikePattern(cleaned);
		if (!pattern) return null;
		let match = await this.queryAndPickTitle(pattern, normalizedInput, volume);
		if (match != null) return match;

		// Relaxed retry (longest token + volume): catches titles polluted with
		// label prefixes (ガガガ文庫) or edition suffixes RanobeDB omits.
		const relaxed = this.toRelaxedPattern(cleaned, volume);
		if (relaxed && relaxed !== pattern) {
			match = await this.queryAndPickTitle(relaxed, normalizedInput, volume);
			if (match != null) return match;
		}

		// Fallback: match the series name, then pick the volume within it
		return await this.resolveBySeries(cleaned, volume);
	}

	private async queryAndPickTitle(
		pattern: string,
		normalizedInput: string,
		volume: number | null,
	): Promise<number | null> {
		const rows = await queryRanobedb<TitleRow>(
			`SELECT bt.book_id, bt.title, bt.romaji
			 FROM book_title bt
			 JOIN book b ON b.id = bt.book_id
			 WHERE b.hidden = false
			   AND (bt.title ILIKE $1 OR bt.romaji ILIKE $1)
			 LIMIT 50`,
			[pattern],
		);
		if (!rows) return null;
		return this.pickBestTitleMatch(rows, normalizedInput, volume);
	}

	// Wildcards everything between letter/digit runs so punctuation-width variants
	// (！ vs !, （ vs () can't break the match.
	private toLikePattern(cleaned: string): string {
		const tokens = this.toTokens(cleaned);
		if (tokens.length === 0) return "";
		return `%${tokens.join("%")}%`;
	}

	/** Longest non-numeric, non-label token (the actual title) + volume, if any. */
	private toRelaxedPattern(cleaned: string, volume: number | null): string {
		const tokens = this.toTokens(cleaned).filter(
			(t) => !/^\d+$/.test(t) && !this.isLabelToken(t),
		);
		if (tokens.length === 0) return "";
		const longest = tokens.reduce((a, b) => (b.length > a.length ? b : a));
		return volume != null ? `%${longest}%${volume}%` : `%${longest}%`;
	}

	// Strips Kindle-store branding RanobeDB doesn't have, e.g.
	// "… 「涼宮ハルヒ」シリーズ (角川スニーカー文庫)".
	private stripTitleNoise(title: string): string {
		return title
			.replace(/[「『][^」』]*[」』]シリーズ/g, " ")
			.replace(
				/[（(][^）)]*(?:文庫|ノベル|ブックス|books|novels)[^）)]*[）)]/gi,
				" ",
			)
			.replace(/【[^】]*】/g, " ");
	}

	/** Bare imprint/branding tokens (ガガガ文庫, 角川スニーカー文庫, シリーズ…) */
	private isLabelToken(token: string): boolean {
		return /(?:文庫J?|ノベルズ|ノベルス|ブックス|シリーズ|完全版|特装版|新装版|特典付き?)$/i.test(
			token,
		);
	}

	private toTokens(cleaned: string): string[] {
		return cleaned
			.replace(/[０-９]/g, (ch) =>
				String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
			)
			.split(/[^\p{L}\p{M}0-9]+/u)
			.filter(Boolean);
	}

	private pickBestTitleMatch(
		rows: TitleRow[],
		normalizedInput: string,
		volume: number | null,
	): number | null {
		const candidates: { bookId: number; normalized: string }[] = [];

		for (const row of rows) {
			for (const text of [row.title, row.romaji]) {
				if (!text) continue;
				const normalized = normalizeForComparison(text);
				if (!isTitleSimilar(normalizedInput, normalized)) continue;
				candidates.push({ bookId: row.book_id, normalized });
				break;
			}
		}

		if (candidates.length === 0) return null;

		// Rank: containment first; with no input volume, prefer titles without a
		// trailing volume (vol 1 is titled that way); then closest length.
		const hasTrailingVolume = (text: string) => /\d(?:\.\d+)?$/.test(text);
		candidates.sort((a, b) => {
			const aContains = a.normalized.includes(normalizedInput) ? 0 : 1;
			const bContains = b.normalized.includes(normalizedInput) ? 0 : 1;
			if (aContains !== bContains) return aContains - bContains;
			if (volume == null) {
				const aVol = hasTrailingVolume(a.normalized) ? 1 : 0;
				const bVol = hasTrailingVolume(b.normalized) ? 1 : 0;
				if (aVol !== bVol) return aVol - bVol;
			}
			return (
				Math.abs(a.normalized.length - normalizedInput.length) -
				Math.abs(b.normalized.length - normalizedInput.length)
			);
		});

		// When the input has a volume number, require it in the matched title
		if (volume != null) {
			const withVolume = candidates.find((c) =>
				(c.normalized.match(/\d+/g) ?? ([] as string[])).includes(
					String(volume),
				),
			);
			return withVolume?.bookId ?? candidates[0]?.bookId ?? null;
		}

		return candidates[0]?.bookId ?? null;
	}

	private async resolveBySeries(
		cleaned: string,
		volume: number | null,
	): Promise<number | null> {
		// Strip the trailing volume number to approximate the series name
		const seriesTerm = cleaned.replace(/[\d０-９]+(?:\.\d+)?\s*$/u, "").trim();
		if (!seriesTerm) return null;

		const pattern = this.toLikePattern(seriesTerm);
		if (!pattern) return null;
		const rows = await queryRanobedb<{
			series_id: number;
			title: string;
			romaji: string | null;
		}>(
			`SELECT st.series_id, st.title, st.romaji
			 FROM series_title st
			 JOIN series s ON s.id = st.series_id
			 WHERE s.hidden = false
			   AND (st.title ILIKE $1 OR st.romaji ILIKE $1)
			 LIMIT 30`,
			[pattern],
		);
		if (!rows) return null;

		const normalizedSeries = normalizeForComparison(seriesTerm);
		const seriesMatch = rows.find((row) =>
			[row.title, row.romaji].some(
				(text) =>
					text &&
					isTitleSimilar(normalizedSeries, normalizeForComparison(text)),
			),
		);
		if (!seriesMatch) return null;

		const books = await queryRanobedb<{
			book_id: number;
			sort_order: number;
			title: string;
		}>(
			`SELECT sb.book_id, sb.sort_order, bt.title
			 FROM series_book sb
			 JOIN book_title bt ON bt.book_id = sb.book_id AND bt.official = true
			 WHERE sb.series_id = $1
			 ORDER BY sb.sort_order ASC`,
			[seriesMatch.series_id],
		);
		if (!books || books.length === 0) return null;

		if (volume != null) {
			// Pick by the volume number in the title — sort_order is reading
			// order and drifts from volume labels when .5 volumes exist.
			const byTitle = books.find(
				(b) => extractTrailingVolume(b.title) === volume,
			);
			if (byTitle) return byTitle.book_id;
			const byOrder = books.find((b) => b.sort_order === volume);
			return byOrder?.book_id ?? null;
		}
		// No volume in the input → assume volume 1
		return books[0]?.book_id ?? null;
	}

	// ─── Mapping ─────────────────────────────────────────

	private async buildMetadata(
		rndbBookId: number,
		input: Partial<BookMetadata>,
	): Promise<Partial<BookMetadata>> {
		const preferJa = (input.languageCode ?? "ja")
			.toLowerCase()
			.startsWith("ja");

		const [bookRows, titleRows, releaseRows, seriesRows, staffRows] =
			await Promise.all([
				queryRanobedb<BookRow>(
					"SELECT id, description, description_ja, olang FROM book WHERE id = $1",
					[rndbBookId],
				),
				queryRanobedb<TitleRow & { lang: string }>(
					"SELECT book_id, lang, title, romaji FROM book_title WHERE book_id = $1 AND official = true",
					[rndbBookId],
				),
				queryRanobedb<ReleaseRow>(
					`SELECT r.release_date, r.pages, r.format, r.lang, r.isbn13, r.amazon, rb.rtype
					 FROM release r
					 JOIN release_book rb ON rb.release_id = r.id
					 WHERE rb.book_id = $1 AND r.hidden = false
					 ORDER BY r.release_date ASC`,
					[rndbBookId],
				),
				queryRanobedb<SeriesRow>(
					`SELECT st.title, st.romaji, sb.sort_order
					 FROM series_book sb
					 JOIN series_title st ON st.series_id = sb.series_id AND st.official = true
					 WHERE sb.book_id = $1
					 ORDER BY CASE WHEN st.lang = $2 THEN 0 ELSE 1 END
					 LIMIT 1`,
					[rndbBookId, preferJa ? "ja" : "en"],
				),
				queryRanobedb<StaffRow>(
					`SELECT sa.name, sa.romaji, bsa.role_type
					 FROM book_staff_alias bsa
					 JOIN staff_alias sa ON sa.id = bsa.staff_alias_id
					 WHERE bsa.book_id = $1 AND bsa.eid = 0`,
					[rndbBookId],
				),
			]);

		const book = bookRows?.[0];
		if (!book) return {};

		const lang = preferJa ? "ja" : "en";
		const titles = titleRows ?? [];
		const titleRow =
			titles.find((t) => (t as TitleRow & { lang: string }).lang === lang) ??
			titles.find(
				(t) => (t as TitleRow & { lang: string }).lang === book.olang,
			) ??
			titles[0];

		const description = preferJa
			? book.description_ja || book.description
			: book.description || book.description_ja;

		// Prefer digital+complete releases in the book's language for ASIN/ISBN.
		// Print /dp/ slugs are ISBN-10s, digital ones are Kindle ASINs.
		const releases = (releaseRows ?? []).filter(
			(r) => r.lang === lang || r.lang === book.olang,
		);
		const ranked = [...releases].sort(
			(a, b) => this.rankRelease(a) - this.rankRelease(b),
		);

		const asin = this.extractAsin(ranked);
		const isbn13 = ranked.find((r) => r.isbn13)?.isbn13 ?? null;
		const pageCount = ranked.find((r) => r.pages != null)?.pages ?? null;
		const publishedDate = this.parseReleaseDate(
			releases.map((r) => r.release_date),
		);

		const seriesRow = seriesRows?.[0];
		const authors = this.mapAuthors(staffRows ?? []);
		const [publisher, genres, tags] = await Promise.all([
			this.fetchPublisher(rndbBookId, lang),
			this.fetchGenres(rndbBookId),
			this.fetchTags(rndbBookId),
		]);

		return {
			...(titleRow?.title ? { title: titleRow.title } : {}),
			...(titleRow?.romaji ? { titleRomaji: titleRow.romaji } : {}),
			...(description ? { description } : {}),
			...(authors.length > 0 ? { authors } : {}),
			...(isbn13 ? { isbn13 } : {}),
			...(asin ? { asin } : {}),
			...(publisher ? { publisher: { name: publisher } } : {}),
			...(publishedDate ? { publishedDate } : {}),
			...(pageCount != null ? { pageCount } : {}),
			...(seriesRow
				? {
						series: {
							name: seriesRow.title,
							// Volume label from the title (handles 6.5-style volumes,
							// where sort_order drifts to plain reading order)
							position:
								(titleRow?.title
									? extractTrailingVolume(titleRow.title)
									: null) ??
								seriesRow.sort_order ??
								null,
						},
					}
				: {}),
			...(genres.length > 0 ? { genres } : {}),
			...(tags.length > 0 ? { tags } : {}),
			// Never set cover — covers come from the user's own files or Amazon
		};
	}

	private rankRelease(release: ReleaseRow): number {
		let rank = 0;
		if (release.format !== "digital") rank += 2;
		if (release.rtype !== "complete") rank += 1;
		return rank;
	}

	private extractAsin(ranked: ReleaseRow[]): string | null {
		// Digital first (Kindle ASIN), then print (its ASIN is the ISBN-10, reviews
		// are shared) — the /dp/ jump still skips the search (~88% JA vs ~13%).
		for (const format of ["digital", "print"] as const) {
			for (const release of ranked) {
				if (release.format !== format || !release.amazon) continue;
				const match = ASIN_PATTERN.exec(release.amazon);
				if (match?.[1]) return match[1].toUpperCase();
			}
		}
		return null;
	}

	private parseReleaseDate(dates: number[]): string | null {
		// release_date is an int YYYYMMDD; unknown month/day use 99 placeholders
		const valid = dates
			.filter((d) => d > 0 && d < 99999999)
			.sort((a, b) => a - b);
		for (const date of valid) {
			const year = Math.floor(date / 10000);
			const month = Math.floor((date % 10000) / 100);
			const day = date % 100;
			if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
				return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
			}
		}
		return null;
	}

	private mapAuthors(
		rows: StaffRow[],
	): { name: string; role: string | null }[] {
		const seen = new Set<string>();
		const authors: { name: string; role: string | null }[] = [];
		// Authors first, then illustrators and the rest
		const order = ["author", "artist", "editor", "translator", "narrator"];
		const sorted = [...rows].sort(
			(a, b) =>
				(order.indexOf(a.role_type) + 1 || 99) -
				(order.indexOf(b.role_type) + 1 || 99),
		);
		for (const row of sorted) {
			if (!row.name || seen.has(row.name)) continue;
			seen.add(row.name);
			authors.push({
				name: row.name,
				role: ROLE_MAP[row.role_type] ?? null,
			});
		}
		return authors;
	}

	private async fetchPublisher(
		rndbBookId: number,
		lang: string,
	): Promise<string | null> {
		const rows = await queryRanobedb<PublisherRow>(
			`SELECT p.name
			 FROM release r
			 JOIN release_book rb ON rb.release_id = r.id
			 JOIN release_publisher rp ON rp.release_id = r.id
			 JOIN publisher p ON p.id = rp.publisher_id
			 WHERE rb.book_id = $1 AND r.hidden = false AND r.lang = $2
			   AND rp.publisher_type = 'publisher'
			 ORDER BY CASE WHEN r.format = 'digital' THEN 0 ELSE 1 END
			 LIMIT 1`,
			[rndbBookId, lang],
		);
		return rows?.[0]?.name ?? null;
	}

	private async fetchGenres(rndbBookId: number): Promise<string[]> {
		const rows = await queryRanobedb<GenreRow>(
			`SELECT t.name
			 FROM series_book sb
			 JOIN series_tag st ON st.series_id = sb.series_id
			 JOIN tag t ON t.id = st.tag_id
			 WHERE sb.book_id = $1 AND t.ttype = 'genre'`,
			[rndbBookId],
		);
		return [...new Set((rows ?? []).map((r) => r.name))];
	}

	private async fetchTags(rndbBookId: number): Promise<string[]> {
		// Demographics (shoujo, seinen…) are fine-grained facets too, not genres
		const rows = await queryRanobedb<GenreRow>(
			`SELECT t.name
			 FROM series_book sb
			 JOIN series_tag st ON st.series_id = sb.series_id
			 JOIN tag t ON t.id = st.tag_id
			 WHERE sb.book_id = $1 AND t.ttype IN ('tag', 'demographic')`,
			[rndbBookId],
		);
		return [...new Set((rows ?? []).map((r) => r.name))];
	}
}

export const ranobedbProvider = new RanobedbProvider();
