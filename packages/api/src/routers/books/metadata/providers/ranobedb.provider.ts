import { queryRanobedb } from "../../../../infrastructure/ranobedb/ranobedb.client";
import { logger } from "../../../../lib/logger";
import {
	assessCatalogIdentity,
	type CatalogTitle,
	isSupplementalCatalogTitle,
	CATALOG_IDENTITY_REASONS as R,
} from "../../../../modules/catalogIdentity";
import { getRanobedbConfig } from "../../../settings/settings.service";
import type { BookMetadata } from "../book.metadata.model";
import { normalizeSeriesAliases } from "../metadata.utils";
import {
	type BookSearchCandidate,
	bookMetadataIdentityEvidence,
	type ISearchableMetadataProvider,
	type MetadataProviderResult,
	metadataProviderResult,
	type ProviderCandidate,
} from "./IMetadata.provider";
import { CANDIDATE_LIMIT } from "./provider.utils";
import {
	cleanSearchTerm,
	extractTrailingVolume,
	extractVolumeNumber,
	normalizeForComparison,
	stripSeriesTagline,
} from "./title-match";

const log = logger.child({ component: "ranobedb-provider" });

// Queries target the locally imported RanobeDB dump (separate `ranobedb` db).
// Its schema isn't a stable API, so all SQL lives here; queryRanobedb fails soft.

const ASIN_PATTERN = /\/dp\/([A-Z0-9]{10})/i;

const SEARCH_RESULT_LIMIT = 8;

// An identifier hit needs no title evidence: the identifier is the evidence.
function identifierCandidate(
	bookId: number,
	identifiers: { isbn13?: string; asin?: string },
): ProviderCandidate {
	return {
		providerId: String(bookId),
		identity: { kind: "book", ...identifiers },
	};
}

const RANOBEDB_BOOK_URL = "https://ranobedb.org/book/";
const RANOBEDB_IMAGE_CDN = "https://images.ranobedb.org/";

function candidateIdentity(
	inputTitle: string,
	candidateTitle: string,
	inputAuthors: string[] = [],
	candidateAuthors: string[] = [],
) {
	return assessCatalogIdentity(
		{ kind: "book", title: inputTitle, authors: inputAuthors },
		{ kind: "book", title: candidateTitle, authors: candidateAuthors },
	);
}

function rejectsAutomaticCandidate(
	inputTitle: string,
	candidateTitle: string,
	inputAuthors: string[] = [],
	candidateAuthors: string[] = [],
): boolean {
	const verdict = candidateIdentity(
		inputTitle,
		candidateTitle,
		inputAuthors,
		candidateAuthors,
	);
	if (
		verdict.status === "rejected" ||
		verdict.reasons.includes(R.PART_MISSING)
	) {
		return true;
	}
	if (verdict.status === "confirmed") return false;
	const shorter = [inputTitle, candidateTitle]
		.map(normalizeForComparison)
		.sort((a, b) => a.length - b.length)[0];
	return !shorter || shorter.length < 6;
}

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

type MatchAuthorRow = {
	book_id: number;
	name: string;
	romaji: string | null;
};

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
	aliases?: string | null;
};

function resolveSeriesPosition(
	title: string | null | undefined,
	sortOrder: number | null | undefined,
): number | null {
	// position is the canonical reading order across the whole RanobeDB series.
	// The title still preserves editorial labels such as 14.5 or 3年生編1;
	// those labels may restart or diverge from the global sequence.
	if (sortOrder != null) return sortOrder;
	return title ? extractTrailingVolume(title) : null;
}

type StaffRow = {
	name: string;
	romaji: string | null;
	role_type: string;
};

type PublisherRow = { name: string };

type GenreRow = { name: string };

class RanobedbProvider implements ISearchableMetadataProvider {
	async isAvailable(serverId: string | null | undefined): Promise<boolean> {
		if (!serverId) return true;
		return (await getRanobedbConfig(serverId)).enabled;
	}

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
			const inputVolume = extractVolumeNumber(stripped);
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
							const candidateVolume = extractVolumeNumber(t);
							const volumeMismatch =
								inputVolume != null && candidateVolume !== inputVolume
									? 2000
									: 0;
							const verdict = candidateIdentity(stripped, t);
							const identityMismatch =
								verdict.status === "rejected" ||
								verdict.reasons.includes(R.PART_MISSING)
									? 2000
									: 0;
							const contains = normalized.includes(normalizedInput) ? 0 : 1000;
							return (
								volumeMismatch +
								identityMismatch +
								contains +
								Math.abs(normalized.length - normalizedInput.length)
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

	/** Ranked books for the pipeline to assess, best first. */
	async discoverCandidates(
		input: Partial<BookMetadata> & { serverId?: string | null },
	): Promise<ProviderCandidate[]> {
		// Library-less books have no organization → default to enabled.
		if (input.serverId) {
			const config = await getRanobedbConfig(input.serverId);
			if (!config.enabled) return [];
		}
		return (await this.resolveCandidates(input)).slice(0, CANDIDATE_LIMIT);
	}

	async hydrateCandidate(
		candidate: ProviderCandidate,
		input: Partial<BookMetadata>,
	): Promise<MetadataProviderResult | null> {
		const rndbBookId = Number.parseInt(candidate.providerId, 10);
		if (!Number.isFinite(rndbBookId)) return null;
		const metadata = await this.buildMetadata(rndbBookId, input);
		if (Object.keys(metadata).length === 0) return null;
		return metadataProviderResult(
			metadata,
			bookMetadataIdentityEvidence(metadata),
		);
	}

	// ─── Lookup ──────────────────────────────────────────

	private async resolveCandidates(
		input: Partial<BookMetadata>,
	): Promise<ProviderCandidate[]> {
		// An identifier pins a single edition; there is nothing to choose between,
		// and the identifier itself is the strongest evidence to hand over.
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
			if (rows?.[0]) {
				return [identifierCandidate(rows[0].book_id, { isbn13: isbn })];
			}
			if (rows === null) return [];
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
			if (rows?.[0]) {
				return [identifierCandidate(rows[0].book_id, { asin: input.asin })];
			}
			if (rows === null) return [];
		}

		if (input.title) {
			return await this.resolveCandidatesByTitle(
				input.title,
				this.inputAuthorNames(input),
			);
		}

		return [];
	}

	/**
	 * The search cascade, returning every surviving book instead of only the
	 * winner. Each stage is a different query shape, so the first stage that
	 * finds anything owns the result — a later, looser stage must never dilute a
	 * precise hit.
	 */
	private async resolveCandidatesByTitle(
		title: string,
		inputAuthors: string[],
	): Promise<ProviderCandidate[]> {
		const stripped = this.stripTitleNoise(title);
		const cleaned = cleanSearchTerm(stripped);
		if (!cleaned) return [];

		const volume = extractVolumeNumber(stripped);
		const normalizedInput = normalizeForComparison(stripped);

		// SQL pre-filter: wildcards between letter/digit runs; precise matching
		// happens in JS.
		const pattern = this.toLikePattern(cleaned);
		if (!pattern) return [];
		let matches = await this.queryAndRankTitles(
			pattern,
			stripped,
			normalizedInput,
			volume,
			inputAuthors,
		);
		if (matches.length > 0) return matches;

		// A supplemental release may repeat a long series tagline that RanobeDB
		// omits. Retry without only that paired tagline while retaining the
		// franchise, supplement marker, and explicit volume; never use the broad
		// single-token or series fallback for supplements.
		if (isSupplementalCatalogTitle(title)) {
			const withoutTagline = stripSeriesTagline(stripped);
			if (withoutTagline !== stripped) {
				const supplementPattern = this.toLikePattern(
					cleanSearchTerm(withoutTagline),
				);
				if (supplementPattern && supplementPattern !== pattern) {
					matches = await this.queryAndRankTitles(
						supplementPattern,
						stripped,
						normalizedInput,
						volume,
						inputAuthors,
					);
					if (matches.length > 0) return matches;
				}
			}
			return [];
		}

		// Relaxed retry (longest token + volume): catches titles polluted with
		// label prefixes (ガガガ文庫) or edition suffixes RanobeDB omits.
		const relaxed = this.toRelaxedPattern(cleaned, volume);
		if (relaxed && relaxed !== pattern) {
			matches = await this.queryAndRankTitles(
				relaxed,
				stripped,
				normalizedInput,
				volume,
				inputAuthors,
			);
			if (matches.length > 0) return matches;
		}

		// Fallback: match the series name, then pick the volume within it. Its
		// authors ride along so the gate can veto a same-titled work by someone
		// else — this fallback is the loosest query shape we run.
		const bySeries = await this.resolveBySeries(cleaned, volume);
		if (bySeries == null) return [];
		const authorsByBook = await this.fetchMatchAuthors([bySeries]);
		return [
			{
				providerId: String(bySeries),
				identity: {
					kind: "book",
					authors: authorsByBook?.get(bySeries) ?? [],
				},
			},
		];
	}

	private async queryAndRankTitles(
		pattern: string,
		inputTitle: string,
		normalizedInput: string,
		volume: number | null,
		inputAuthors: string[],
	): Promise<ProviderCandidate[]> {
		const rows = await queryRanobedb<TitleRow>(
			`SELECT bt.book_id, bt.title, bt.romaji
			 FROM book_title bt
			 JOIN book b ON b.id = bt.book_id
			 WHERE b.hidden = false
			   AND (bt.title ILIKE $1 OR bt.romaji ILIKE $1)
			 LIMIT 50`,
			[pattern],
		);
		if (!rows) return [];

		// Authors for every book the query returned: they are evidence the gate
		// needs, not a filter to apply here.
		const bookIds = [...new Set(rows.map((row) => row.book_id))];
		const authorsByBook =
			bookIds.length > 0
				? await this.fetchMatchAuthors(bookIds)
				: new Map<number, string[]>();
		if (authorsByBook == null) return [];

		const ranked = this.rankTitleMatches(
			rows,
			inputTitle,
			normalizedInput,
			volume,
			inputAuthors,
			authorsByBook,
		);
		// The search rows are the evidence: every title form the query returned
		// for a book, plus its explicit authors. No extra round-trip, and rich
		// enough for the preliminary verdict to drop wrong volumes and wrong
		// authors before anything is fetched.
		const titlesByBook = new Map<number, CatalogTitle[]>();
		for (const row of rows) {
			const titles = titlesByBook.get(row.book_id) ?? [];
			if (row.title) titles.push({ role: "title", value: row.title });
			if (row.romaji) titles.push({ role: "romaji", value: row.romaji });
			titlesByBook.set(row.book_id, titles);
		}
		return ranked.map((bookId) => ({
			providerId: String(bookId),
			identity: {
				kind: "book" as const,
				titles: titlesByBook.get(bookId) ?? [],
				authors: authorsByBook.get(bookId) ?? [],
			},
		}));
	}

	private inputAuthorNames(input: Partial<BookMetadata>): string[] {
		return (input.authors ?? [])
			.filter((author) => {
				const role = author.role?.toLowerCase();
				return !role || role === "author" || role === "著者";
			})
			.map((author) => author.name.trim())
			.filter(Boolean);
	}

	private async fetchMatchAuthors(
		bookIds: number[],
	): Promise<Map<number, string[]> | null> {
		const rows = await queryRanobedb<MatchAuthorRow>(
			`SELECT bsa.book_id, sa.name, sa.romaji
			 FROM book_staff_alias bsa
			 JOIN staff_alias sa ON sa.id = bsa.staff_alias_id
			 WHERE bsa.book_id = ANY($1::int[])
			   AND bsa.eid = 0 AND bsa.role_type = 'author'`,
			[bookIds],
		);
		if (!rows) return null;

		const authorsByBook = new Map<number, string[]>();
		for (const row of rows) {
			const names = authorsByBook.get(row.book_id) ?? [];
			for (const name of [row.name, row.romaji]) {
				if (name && !names.includes(name)) names.push(name);
			}
			authorsByBook.set(row.book_id, names);
		}
		return authorsByBook;
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
			.replace(/【([^】]*)】/g, (full, content: string) =>
				isSupplementalCatalogTitle(content) ? full : " ",
			);
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

	/**
	 * Every book that survives the identity veto and the input's volume, best
	 * first. Ranking orders the list; it never decides identity — the pipeline
	 * does that with the full list in hand.
	 */
	private rankTitleMatches(
		rows: TitleRow[],
		inputTitle: string,
		normalizedInput: string,
		volume: number | null,
		inputAuthors: string[],
		authorsByBook: Map<number, string[]>,
	): number[] {
		const candidates: {
			bookId: number;
			normalized: string;
			volume: number | null;
			trailingVolume: number | null;
		}[] = [];

		for (const row of rows) {
			for (const text of [row.title, row.romaji]) {
				if (!text) continue;
				const normalized = normalizeForComparison(text);
				if (
					rejectsAutomaticCandidate(
						inputTitle,
						text,
						inputAuthors,
						authorsByBook.get(row.book_id) ?? [],
					)
				)
					continue;
				candidates.push({
					bookId: row.book_id,
					normalized,
					volume: extractVolumeNumber(text),
					trailingVolume: extractTrailingVolume(text),
				});
				break;
			}
		}

		if (candidates.length === 0) return [];

		// Rank: containment first; with no input volume, prefer titles without a
		// trailing volume (vol 1 is titled that way); then closest length.
		candidates.sort((a, b) => {
			const aContains = a.normalized.includes(normalizedInput) ? 0 : 1;
			const bContains = b.normalized.includes(normalizedInput) ? 0 : 1;
			if (aContains !== bContains) return aContains - bContains;
			if (volume == null) {
				const aVol = a.trailingVolume != null ? 1 : 0;
				const bVol = b.trailingVolume != null ? 1 : 0;
				if (aVol !== bVol) return aVol - bVol;
			}
			return (
				Math.abs(a.normalized.length - normalizedInput.length) -
				Math.abs(b.normalized.length - normalizedInput.length)
			);
		});

		// When the input has a volume number, require it in the matched title
		const eligible =
			volume != null
				? candidates.filter((candidate) => candidate.volume === volume)
				: candidates;

		return [...new Set(eligible.map((candidate) => candidate.bookId))];
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
			[row.title, row.romaji].some((text) => {
				if (!text) return false;
				const normalizedCandidate = normalizeForComparison(text);
				return (
					normalizedCandidate === normalizedSeries ||
					!rejectsAutomaticCandidate(seriesTerm, text)
				);
			}),
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

		let matchedBookId: number | null;
		if (volume != null) {
			// Pick by the volume number in the title — sort_order is reading
			// order and drifts from volume labels when .5 volumes exist.
			const byTitle = books.find(
				(b) => extractTrailingVolume(b.title) === volume,
			);
			const byOrder = books.find((b) => b.sort_order === volume);
			matchedBookId = byTitle?.book_id ?? byOrder?.book_id ?? null;
		} else {
			// No volume in the input → assume volume 1
			matchedBookId = books[0]?.book_id ?? null;
		}

		return matchedBookId;
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
					`SELECT st.title, st.romaji, sb.sort_order, s.aliases
					 FROM series_book sb
					 JOIN series s ON s.id = sb.series_id
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
		const seriesAliases = seriesRow
			? this.parseSeriesAliases(
					seriesRow.aliases,
					seriesRow.romaji,
					seriesRow.title,
				)
			: undefined;
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
							aliases: seriesAliases,
							// Canonical reading order from RanobeDB; title parsing is
							// only a fallback when the source does not provide it.
							position: resolveSeriesPosition(
								titleRow?.title,
								seriesRow.sort_order,
							),
						},
					}
				: {}),
			...(genres.length > 0 ? { genres } : {}),
			...(tags.length > 0 ? { tags } : {}),
			// Never set cover — covers come from the user's own files or Amazon
		};
	}

	private parseSeriesAliases(
		raw: string | null | undefined,
		romaji: string | null,
		canonical: string,
	): string[] {
		return normalizeSeriesAliases(
			[...(raw?.split(/\r?\n/u) ?? []), romaji ?? ""],
			canonical,
		);
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
