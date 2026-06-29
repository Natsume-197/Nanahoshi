import * as fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { logger } from "../../../../lib/logger";
import {
	type AmazonConfig,
	getAmazonConfig,
} from "../../../settings/settings.service";
import type { BookMetadata } from "../book.metadata.model";
import type { IMetadataProvider } from "./IMetadata.provider";
import {
	cleanSearchTerm,
	HAS_VOLUME_PATTERN,
	isTitleSimilar,
	normalizeForComparison,
	partMarkersConflict,
	stripImprintParens,
	stripSeriesTagline,
	titleSimilarityScore,
} from "./title-match";

const log = logger.child({ component: "amazon-provider" });

// ─── Errors ──────────────────────────────────────────────

export class AmazonTransientError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AmazonTransientError";
	}
}

// ─── Constants ───────────────────────────────────────────

const MIN_DELAY_MS = 3000;
const MAX_DELAY_MS = 4500;
const MIN_DELAY_COOKIE_MS = 1200;
const MAX_DELAY_COOKIE_MS = 2000;
const MAX_RETRIES = 3;
const BLOCK_THRESHOLD = 3;

// Anti-bot wall serves HTTP 200 with a captcha/throttle shell instead of
// 429/503 — detect it so enrichment raises a rate-limit error, not "no results".
const BLOCK_PAGE_MARKERS = [
	"validateCaptcha",
	"/errors/validateCaptcha",
	"api-services-support@amazon",
	"Robot Check",
	"ロボットでは",
	"自動アクセス",
	"Type the characters you see",
	"Enter the characters you see below",
];
// Real pages are hundreds of KB; the anti-bot shell is a few KB. Size, not the
// <title> (captcha pages have one), is the reliable block signal.
const MIN_REAL_PAGE_BYTES = 50000;

const USER_AGENT_POOL: Array<{
	ua: string;
	secChUa: string;
	platform: string;
	platformVersion: string;
	mobile: string;
}> = [
	{
		ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
		secChUa:
			'"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
		platform: '"macOS"',
		platformVersion: '"14.4.0"',
		mobile: "?0",
	},
	{
		ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
		secChUa:
			'"Google Chrome";v="125", "Chromium";v="125", "Not/A)Brand";v="24"',
		platform: '"Windows"',
		platformVersion: '"15.0.0"',
		mobile: "?0",
	},
	{
		ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
		secChUa: '"Not)A;Brand";v="99", "Safari";v="17"',
		platform: '"macOS"',
		platformVersion: '"14.5.0"',
		mobile: "?0",
	},
	{
		ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
		secChUa: '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
		platform: '"Linux"',
		platformVersion: '"6.5.0"',
		mobile: "?0",
	},
	{
		ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
		secChUa: '"Firefox";v="126"',
		platform: '"Windows"',
		platformVersion: '"10.0.0"',
		mobile: "?0",
	},
];

const DOMAIN_LOCALE_MAP: Record<string, string> = {
	"co.jp": "ja-JP,ja;q=0.9,en;q=0.8",
	com: "en-US,en;q=0.9",
	"co.uk": "en-GB,en;q=0.9",
	de: "de-DE,de;q=0.9,en;q=0.8",
	fr: "fr-FR,fr;q=0.9,en;q=0.8",
	es: "es-ES,es;q=0.9,en;q=0.8",
	it: "it-IT,it;q=0.9,en;q=0.8",
	ca: "en-CA,en;q=0.9",
	"com.au": "en-AU,en;q=0.9",
	"com.br": "pt-BR,pt;q=0.9,en;q=0.8",
	"com.mx": "es-MX,es;q=0.9,en;q=0.8",
	nl: "nl-NL,nl;q=0.9,en;q=0.8",
	se: "sv-SE,sv;q=0.9,en;q=0.8",
	pl: "pl-PL,pl;q=0.9,en;q=0.8",
};

const NON_DIGIT_PATTERN = /[^\d]/g;
// Matches series position in various formats:
// EN: "Book 3 of 15"
// JP pattern 1: "3巻 (全15巻)"
// JP pattern 2: "全17冊中3番目の本"
const SERIES_POSITION_PATTERNS = [
	/Book\s+(\d+(?:\.\d+)?)\s+of/i,
	/全\d+冊中(\d+)番目/,
	/^(\d+(?:\.\d+)?)巻/,
	/(\d+(?:\.\d+)?)/,
];

const PUBLISHER_KEYWORDS = [
	"publisher",
	"herausgeber",
	"éditeur",
	"editoriale",
	"editorial",
	"uitgever",
	"wydawca",
	"出版社",
	"editora",
];

const BOX_SET_PHRASES = [
	"books set",
	"box set",
	"collection set",
	"summary & study guide",
	// Japanese compilation/omnibus markers
	"合本版",
	"合本",
	"全巻セット",
	"まとめ買い",
	"冊セット",
	"全冊収録",
];

// Bonus/side content markers — filtered when input has no volume number
const BONUS_CONTENT_PHRASES = [
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

// Phrases on series LANDING cards (not individual books). Avoid "Kindleシリーズ"
// / "book series" — real books in a series show those too.
const SERIES_CARD_PHRASES = [
	"巻のシリーズ",
	"冊のシリーズ",
	"シリーズ全",
	"books in this series",
];

// Non-text format markers — filtered when input doesn't contain them
const NON_TEXT_PHRASES = [
	"画集",
	"イラスト集",
	"アートブック",
	"art book",
	"artbook",
	"illustration",
	"comic",
	"コミック",
	"コミックス",
	"マガジンポケット",
];

const TITLE_SELECTORS = [
	"#productTitle",
	"#ebooksProductTitle",
	"h1#title",
	"span#productTitle",
];

// Contributor-role markers in an author string (e.g. "木爾チレン　イラスト：和遥キナ");
// the part after the marker isn't the author, so keep only the leading segment.
const AUTHOR_ROLE_MARKER =
	/[\s　]*(?:イラスト|イラストレーター|絵|画|作画|漫画|著者?|原作|原案|キャラクター原案|キャラクターデザイン|監修|構成|シナリオ|脚本|翻訳|訳|編|編集|company|illustrat\w*|art)\s*[：:]/iu;

/** Keep only the primary author, dropping any "Role：Name" annotations. */
function stripAuthorRole(name: string): string {
	const match = name.match(AUTHOR_ROLE_MARKER);
	const cut = match?.index != null ? name.slice(0, match.index) : name;
	return cut.trim();
}

// ─── Amazon Provider ─────────────────────────────────────

class AmazonProvider implements IMetadataProvider {
	// Serialized gate: callers chain off `gate`/`nextAllowedAt` so requests stay
	// spaced even under concurrent enrich jobs.
	private gate: Promise<void> = Promise.resolve();
	private nextAllowedAt = 0;
	// Cached per org: domain/cookie are tenant-scoped, so a shared cache would
	// leak one tenant's config into another's through this singleton.
	private configCache = new Map<string, { config: AmazonConfig; at: number }>();
	private coversDirCreated = false;

	async getMetadata(
		input: Partial<BookMetadata> & {
			bookId?: number;
			uuid?: string;
			serverId?: string | null;
			amazonDomain?: string;
		},
	): Promise<Partial<BookMetadata>> {
		try {
			const baseConfig = await this.getConfig(input.serverId);
			// Per-library domain override (the store follows the library's
			// language); falls back to the org default when unset.
			const config = input.amazonDomain
				? { ...baseConfig, domain: input.amazonDomain }
				: baseConfig;
			if (!config.enabled) return {};

			let asin = input.asin ?? null;

			const inputTitle = input.title;
			const inputHasVolume = inputTitle
				? HAS_VOLUME_PATTERN.test(inputTitle)
				: false;
			const inputIsBonus = inputTitle
				? BONUS_CONTENT_PHRASES.some((p) => inputTitle.includes(p))
				: false;

			let $: ReturnType<typeof cheerio.load> | null = null;
			let metadata: Partial<BookMetadata> = {};

			if (asin) {
				$ = await this.fetchPage(
					`https://www.amazon.${config.domain}/dp/${asin}`,
					config,
				);
				if ($) metadata = this.parseBookPage($, asin);
			} else {
				// Progressively relaxed queries: drop narrowing terms (author, series
				// tagline) one tier at a time, since Amazon's title may omit them.
				const searchUrls = this.buildSearchUrlVariants(input, config.domain);
				if (searchUrls.length === 0) return {};

				let candidates: string[] = [];
				for (const searchUrl of searchUrls) {
					candidates = await this.searchCandidates(
						searchUrl,
						config,
						input.title ?? undefined,
						inputHasVolume,
						inputIsBonus,
					);
					if (candidates.length > 0) break;
				}

				// Try candidates best-first: the top hit can be a series landing page
				// (no #productTitle) — fall through to the next real book page.
				for (const candidate of candidates) {
					const $c = await this.fetchPage(
						`https://www.amazon.${config.domain}/dp/${candidate}`,
						config,
					);
					if (!$c) continue;
					const parsed = this.parseBookPage($c, candidate);
					if (parsed.title) {
						asin = candidate;
						$ = $c;
						metadata = parsed;
						break;
					}
				}
			}

			// No usable book page (all candidates were series/landing pages).
			if (!$ || !metadata.title) return {};

			// Bare series title with no volume → redirect to vol 1. A
			// subtitle-distinguished volume (涼宮ハルヒの劇場) is its own book, not
			// vol 1, so it keeps its ASIN. Skip for bonus content.
			if (
				!inputHasVolume &&
				!inputIsBonus &&
				metadata.series?.position != null &&
				metadata.series.position > 1 &&
				metadata.series.name &&
				inputTitle &&
				this.isBareSeriesTitle(inputTitle, metadata.series.name)
			) {
				const vol1Query = `${this.cleanSearchTerm(metadata.series.name)} 1`;
				const vol1SearchUrl = `https://www.amazon.${config.domain}/s?k=${encodeURIComponent(vol1Query)}&i=digital-text`;
				const vol1Asin = await this.searchForAsin(
					vol1SearchUrl,
					config,
					metadata.series.name,
					false,
				);
				if (vol1Asin && vol1Asin !== asin) {
					const vol1Url = `https://www.amazon.${config.domain}/dp/${vol1Asin}`;
					const $vol1 = await this.fetchPage(vol1Url, config);
					if ($vol1) {
						asin = vol1Asin;
						$ = $vol1;
						metadata = this.parseBookPage($, asin);
					}
				}
			}

			if (metadata.cover && !input.cover && input.uuid) {
				const localCoverPath = await this.downloadCover(
					metadata.cover,
					input.uuid,
				);
				if (localCoverPath) {
					metadata.cover = localCoverPath;
				} else {
					// If download failed, don't return the URL as cover path
					metadata.cover = undefined;
				}
			} else if (input.cover) {
				// Don't overwrite existing cover
				metadata.cover = undefined;
			}

			return metadata;
		} catch (error) {
			if (error instanceof AmazonTransientError) throw error;
			log.warn({ err: error }, "Error fetching metadata");
			return {};
		}
	}

	// ─── Search ──────────────────────────────────────────

	private buildSearchUrl(
		input: Partial<BookMetadata>,
		domain: string,
	): string | null {
		// Priority: ISBN > title + author
		const isbn = input.isbn13 || input.isbn10;
		if (isbn) {
			return `https://www.amazon.${domain}/s?k=${encodeURIComponent(isbn)}&i=digital-text`;
		}

		const parts: string[] = [];

		if (input.title) {
			parts.push(this.cleanSearchTerm(input.title));
		}

		if (input.authors?.length) {
			const firstAuthor = input.authors[0]?.name;
			if (firstAuthor) {
				const primaryAuthor = this.cleanSearchTerm(
					stripAuthorRole(firstAuthor),
				);
				if (primaryAuthor) parts.push(primaryAuthor);
			}
		}

		if (parts.length === 0) return null;

		const query = parts.join(" ");
		// i=digital-text restricts to Kindle Store (ebooks only)
		return `https://www.amazon.${domain}/s?k=${encodeURIComponent(query)}&i=digital-text`;
	}

	// Ordered search URLs from most to least specific: drop author, then the
	// series tagline, one tier at a time (Amazon's title may omit them). An ISBN
	// collapses everything to one URL.
	private buildSearchUrlVariants(
		input: Partial<BookMetadata>,
		domain: string,
	): string[] {
		const title = input.title ?? undefined;
		const bareTitle = title ? stripSeriesTagline(title) : undefined;
		const hasTagline = bareTitle != null && bareTitle !== title;

		const inputs: Partial<BookMetadata>[] = [input];
		if (input.authors?.length && title) inputs.push({ ...input, authors: [] });
		if (hasTagline) {
			inputs.push({ ...input, title: bareTitle });
			if (input.authors?.length) {
				inputs.push({ ...input, title: bareTitle, authors: [] });
			}
		}

		const urls: string[] = [];
		for (const variant of inputs) {
			const url = this.buildSearchUrl(variant, domain);
			if (url && !urls.includes(url)) urls.push(url);
		}
		return urls;
	}

	private cleanSearchTerm(text: string): string {
		return cleanSearchTerm(text);
	}

	// True when the title is just the bare series name (no subtitle) — only then
	// does "no volume" imply vol 1. Subtitle-distinguished volumes keep their ASIN.
	private isBareSeriesTitle(inputTitle: string, seriesName: string): boolean {
		const ni = this.normalizeForComparison(this.cleanSearchTerm(inputTitle));
		const ns = this.normalizeForComparison(this.cleanSearchTerm(seriesName));
		if (!ni || !ns) return false;
		// Input must not extend past the series name. (ns.startsWith(ni) also
		// covers an input abbreviated relative to Amazon's longer series name.)
		return ni === ns || ns.startsWith(ni);
	}

	private async searchCandidates(
		searchUrl: string,
		config: AmazonConfig,
		inputTitle?: string,
		inputHasVolume = true,
		inputIsBonus = false,
	): Promise<string[]> {
		log.info({ searchUrl }, "Searching");
		const $ = await this.fetchPage(searchUrl, config);
		if (!$) return [];

		const searchResults = $(
			"span[data-component-type='s-search-results']",
		).first();
		if (!searchResults.length) {
			log.info("No search results container found");
			return [];
		}

		const items = searchResults.find("div[data-asin]");
		log.info({ count: items.length }, "Found items");
		const normalizedInput = inputTitle
			? this.normalizeForComparison(
					this.cleanSearchTerm(stripImprintParens(inputTitle)),
				)
			: null;

		// When input has a volume number, return first valid match.
		// When it doesn't, collect candidates and pick the best one.
		const inputLength = normalizedInput?.length ?? 0;
		const candidates: {
			asin: string;
			titleLength: number;
			title: string;
			normalizedTitle: string;
		}[] = [];

		for (let i = 0; i < items.length; i++) {
			const item = $(items[i]);
			const asin = item.attr("data-asin");
			if (!asin || asin.trim() === "") continue;

			// Filter out box sets, compilations, and series cards
			const text = item.text().toLowerCase();
			if (text.includes("collects books from")) continue;
			if (BOX_SET_PHRASES.some((phrase) => text.includes(phrase))) continue;
			if (SERIES_CARD_PHRASES.some((phrase) => text.includes(phrase))) continue;

			// Extract title from the search result card.
			// Primary: h2 inside title-recipe div. Fallback: any h2 in the item.
			const titleDiv = item.find("div[data-cy='title-recipe']");
			let h2El = titleDiv.find("h2").first();
			if (!h2El.length) {
				h2El = item.find("h2").first();
			}
			if (!h2El.length) continue;
			const titleText = h2El.text().trim().toLowerCase();

			// Part markers must agree: a movie 上 must never match a novel 前編,
			// even when their franchise prefixes make them look similar.
			if (inputTitle && partMarkersConflict(inputTitle, titleText)) continue;

			// When input is bonus content, result must also be bonus content.
			// When input is NOT bonus and has no volume number, filter out bonus results.
			const resultIsBonus = BONUS_CONTENT_PHRASES.some((phrase) =>
				titleText.includes(phrase),
			);
			if (inputIsBonus && !resultIsBonus) continue;
			if (!inputIsBonus && !inputHasVolume && resultIsBonus) continue;

			// Filter out non-text formats (art books, manga) unless input contains those terms
			const inputLower = inputTitle?.toLowerCase() ?? "";
			const resultIsNonText = NON_TEXT_PHRASES.some((phrase) =>
				titleText.includes(phrase),
			);
			if (resultIsNonText) {
				const inputHasNonText = NON_TEXT_PHRASES.some((phrase) =>
					inputLower.includes(phrase),
				);
				if (!inputHasNonText) continue;
			}

			// Validate title similarity if we have an input title
			const normalizedResult = normalizedInput
				? this.normalizeForComparison(
						this.cleanSearchTerm(stripImprintParens(titleText)),
					)
				: null;
			if (normalizedInput && normalizedResult) {
				if (!this.isTitleSimilar(normalizedInput, normalizedResult)) continue;
			}

			candidates.push({
				asin,
				titleLength: normalizedResult?.length ?? titleText.length,
				title: titleText,
				normalizedTitle: normalizedResult ?? titleText,
			});

			if (candidates.length >= 10) break;
		}

		if (candidates.length === 0) return [];

		// Rank by content similarity (bigram overlap), then length proximity as a
		// tiebreak — length alone can't separate same-length series siblings.
		candidates.sort((a, b) => {
			if (normalizedInput) {
				const sa = titleSimilarityScore(normalizedInput, a.normalizedTitle);
				const sb = titleSimilarityScore(normalizedInput, b.normalizedTitle);
				if (sa !== sb) return sb - sa;
			}
			return (
				Math.abs(a.titleLength - inputLength) -
				Math.abs(b.titleLength - inputLength)
			);
		});

		log.info(
			{
				inputTitle,
				candidates: candidates.map(
					(c) =>
						`${c.asin} (len=${c.titleLength}, diff=${Math.abs(c.titleLength - inputLength)}) "${c.title}"`,
				),
			},
			"Candidates",
		);

		return candidates.map((c) => c.asin);
	}

	/** Top-ranked ASIN for a search, or null. Thin wrapper over searchCandidates. */
	private async searchForAsin(
		searchUrl: string,
		config: AmazonConfig,
		inputTitle?: string,
		inputHasVolume = true,
		inputIsBonus = false,
	): Promise<string | null> {
		const [top] = await this.searchCandidates(
			searchUrl,
			config,
			inputTitle,
			inputHasVolume,
			inputIsBonus,
		);
		return top ?? null;
	}

	private normalizeForComparison(text: string): string {
		return normalizeForComparison(text);
	}

	private isTitleSimilar(input: string, result: string): boolean {
		return isTitleSimilar(input, result);
	}

	// ─── Book Page Parsing ───────────────────────────────

	private parseBookPage(
		$: cheerio.CheerioAPI,
		asin: string,
	): Partial<BookMetadata> {
		const titleInfo = this.parseTitle($);
		const seriesInfo = this.parseSeries($);
		const authors = this.parseAuthors($);
		const description = this.parseDescription($);
		const isbn13 = this.parseIsbn($, "isbn13");
		const isbn10 = this.parseIsbn($, "isbn10");
		const publisherName = this.parsePublisher($);
		const publishedDate = this.parsePublicationDate($);
		const language = this.parseLanguage($);
		const pageCount = this.parsePageCount($);
		const coverUrl = this.parseCover($);
		const rating = this.parseRating($);
		const reviewCount = this.parseReviewCount($);
		const genres = this.parseCategories($);

		return {
			...(titleInfo.title ? { title: titleInfo.title } : {}),
			...(titleInfo.subtitle ? { subtitle: titleInfo.subtitle } : {}),
			...(description ? { description } : {}),
			...(authors.length > 0 ? { authors } : {}),
			...(isbn13 ? { isbn13 } : {}),
			...(isbn10 ? { isbn10 } : {}),
			asin,
			...(publisherName ? { publisher: { name: publisherName } } : {}),
			...(publishedDate ? { publishedDate } : {}),
			...(language ? { languageCode: language } : {}),
			...(pageCount ? { pageCount } : {}),
			...(coverUrl ? { cover: coverUrl } : {}),
			...(seriesInfo ? { series: seriesInfo } : {}),
			...(rating != null ? { amazonRating: rating } : {}),
			...(reviewCount != null ? { amazonReviewCount: reviewCount } : {}),
			...(genres.length > 0 ? { genres } : {}),
		};
	}

	private parseTitle($: cheerio.CheerioAPI): {
		title: string | null;
		subtitle: string | null;
	} {
		for (const selector of TITLE_SELECTORS) {
			const el = $(selector).first();
			if (el.length && el.text().trim()) {
				const fullTitle = el.text().trim();
				const colonIdx = fullTitle.indexOf(":");
				if (colonIdx > 0) {
					return {
						title: fullTitle.slice(0, colonIdx).trim(),
						subtitle: fullTitle.slice(colonIdx + 1).trim() || null,
					};
				}
				return { title: fullTitle, subtitle: null };
			}
		}
		return { title: null, subtitle: null };
	}

	private parseAuthors(
		$: cheerio.CheerioAPI,
	): { name: string; role: string | null }[] {
		const authors: { name: string; role: string | null }[] = [];

		const extractFromContainer = (container: cheerio.Cheerio<Element>) => {
			container.find(".author").each((_, authorEl) => {
				const $author = $(authorEl);
				const nameEl = $author.find("a").first();
				const name = nameEl.text().trim();
				if (!name || name.toLowerCase().includes("visit the")) return;

				// Role is in a .contribution span, e.g. "(著)", "(イラスト)", "(Author)"
				const contributionEl = $author.find(".contribution span").first();
				let role: string | null = null;
				if (contributionEl.length) {
					role =
						contributionEl
							.text()
							.trim()
							.replace(/^[(（\s,]+|[)）\s,]+$/g, "")
							.trim() || null;
				}

				authors.push({ name, role });
			});
		};

		// Try primary selector
		const bylineDiv = $("#bylineInfo_feature_div");
		if (bylineDiv.length) {
			extractFromContainer(bylineDiv);
		}

		// Fallback
		if (authors.length === 0) {
			const bylineInfo = $("#bylineInfo");
			if (bylineInfo.length) {
				extractFromContainer(bylineInfo);
			}
		}

		// Last resort
		if (authors.length === 0) {
			$(".author").each((_, el) => {
				const $author = $(el);
				const nameEl = $author.find("a").first();
				const name = nameEl.text().trim();
				if (!name || name.toLowerCase().includes("visit the")) return;

				const contributionEl = $author.find(".contribution span").first();
				let role: string | null = null;
				if (contributionEl.length) {
					role =
						contributionEl
							.text()
							.trim()
							.replace(/^[(（\s,]+|[)）\s,]+$/g, "")
							.trim() || null;
				}

				authors.push({ name, role });
			});
		}

		return authors;
	}

	private parseDescription($: cheerio.CheerioAPI): string | null {
		let el: cheerio.Cheerio<Element> | null = null;

		// Primary: expander content
		const expander = $(
			"[data-a-expander-name='book_description_expander'] .a-expander-content",
		).first();
		if (expander.length) el = expander;

		// Fallback: noscript
		if (!el) {
			const noscript = $("#bookDescription_feature_div noscript").first();
			if (noscript.length) el = noscript;
		}

		// Last resort
		if (!el) {
			const simple = $("div.product-description").first();
			if (simple.length) el = simple;
		}

		if (!el) return null;

		// Convert <br> to newlines, then strip all HTML tags
		el.find("br").replaceWith("\n");
		const text = el.text().trim();
		return text || null;
	}

	private parseIsbn($: cheerio.CheerioAPI, type: string): string | null {
		// RPI attribute
		const rpiSelector = `#rpi-attribute-book_details-${type} .rpi-attribute-value span`;
		const rpiEl = $(rpiSelector).first();
		if (rpiEl.length) {
			const text = rpiEl.text().trim();
			if (text) return this.cleanIsbn(text);
		}

		// Detail bullets fallback
		const bulletKey = type === "isbn10" ? "ISBN-10" : "ISBN-13";
		return this.extractFromDetailBullets($, bulletKey);
	}

	private parsePublisher($: cheerio.CheerioAPI): string | null {
		const featureEl = $("#detailBullets_feature_div");
		if (!featureEl.length) return null;

		const listItems = featureEl.find("li");
		for (let i = 0; i < listItems.length; i++) {
			const li = $(listItems[i]);
			const boldEl = li.find("span.a-text-bold").first();
			if (!boldEl.length) continue;

			const header = boldEl.text().toLowerCase();
			if (PUBLISHER_KEYWORDS.some((kw) => header.includes(kw))) {
				const valueSpan = boldEl.next("span");
				if (valueSpan.length) {
					const fullText = valueSpan.text().trim();
					// Remove parenthesized content and split on semicolon
					const part = fullText.split(";")[0] ?? fullText;
					return part
						.trim()
						.replace(/\s*\(.*?\)/g, "")
						.trim();
				}
			}
		}

		return null;
	}

	private parseSeries(
		$: cheerio.CheerioAPI,
	): { name: string; position: number | null } | null {
		const seriesNameEl = $(
			"#rpi-attribute-book_details-series .rpi-attribute-value a span",
		).first();
		if (!seriesNameEl.length) return null;

		const name = seriesNameEl.text().trim();
		if (!name) return null;

		let position: number | null = null;
		const labelEl = $(
			"#rpi-attribute-book_details-series .rpi-attribute-label span",
		).first();
		if (labelEl.length) {
			const labelText = labelEl.text().trim();
			for (const pattern of SERIES_POSITION_PATTERNS) {
				const match = pattern.exec(labelText);
				if (match?.[1]) {
					position = Number.parseFloat(match[1]);
					break;
				}
			}
		}

		return { name, position };
	}

	private parseLanguage($: cheerio.CheerioAPI): string | null {
		const el = $("#rpi-attribute-language .rpi-attribute-value span").first();
		return el.length ? el.text().trim() || null : null;
	}

	private parsePageCount($: cheerio.CheerioAPI): number | null {
		const el = $(
			"#rpi-attribute-book_details-fiona_pages .rpi-attribute-value span",
		).first();
		if (!el.length) return null;

		const cleaned = el.text().replace(NON_DIGIT_PATTERN, "");
		const num = Number.parseInt(cleaned, 10);
		return Number.isNaN(num) ? null : num;
	}

	private parseCover($: cheerio.CheerioAPI): string | null {
		const img = $("#landingImage").first();
		if (!img.length) return null;

		const highRes = img.attr("data-old-hires");
		if (highRes?.trim()) return highRes;

		const src = img.attr("src");
		if (src?.trim()) return src;

		return null;
	}

	private parsePublicationDate($: cheerio.CheerioAPI): string | null {
		// RPI attribute
		const el = $(
			"#rpi-attribute-book_details-publication_date .rpi-attribute-value span",
		).first();
		if (el.length) {
			const parsed = this.parseDate(el.text().trim());
			if (parsed) return parsed;
		}

		// Detail bullets fallback
		const featureEl = $("#detailBullets_feature_div");
		if (featureEl.length) {
			const listItems = featureEl.find("li");
			for (let i = 0; i < listItems.length; i++) {
				const li = $(listItems[i]);
				const boldEl = li.find("span.a-text-bold").first();
				const valueSpan = boldEl.length ? boldEl.next("span") : null;
				if (valueSpan?.length) {
					const parsed = this.parseDate(valueSpan.text().trim());
					if (parsed) return parsed;
				}
			}
		}

		return null;
	}

	private parseRating($: cheerio.CheerioAPI): number | null {
		// Rating lives in #acrPopover's title, which survives layout variants.
		// Scope the icon-alt fallback to the popover — a document-wide .a-icon-alt
		// can match an unrelated star widget.
		const popover = $("#acrPopover").first();
		if (!popover.length) return null;
		return (
			this.extractRating(popover.attr("title")) ??
			this.extractRating(popover.find("span.a-icon-alt").first().text())
		);
	}

	// Score from a "stars" phrase: the rating is the smaller of the two numbers
	// (score vs "out of 5"), so min works regardless of locale word order.
	private extractRating(text?: string | null): number | null {
		if (!text) return null;
		const matches = text.replace(/,/g, ".").match(/\d+(?:\.\d+)?/g);
		if (!matches) return null;
		const nums = matches.map(Number).filter((n) => n >= 0 && n <= 5);
		return nums.length ? Math.min(...nums) : null;
	}

	private parseReviewCount($: cheerio.CheerioAPI): number | null {
		// #acrCustomerReviewText holds "(176)" / "176 ratings"; present without the
		// feature_div wrapper too.
		const countEl = $("#acrCustomerReviewText").first();
		if (!countEl.length) return null;

		const cleaned = (countEl.text().match(/[\d,]+/)?.[0] ?? "").replace(
			NON_DIGIT_PATTERN,
			"",
		);
		if (!cleaned) return null;
		const num = Number.parseInt(cleaned, 10);
		return Number.isNaN(num) ? null : num;
	}

	private parseCategories($: cheerio.CheerioAPI): string[] {
		const categoriesEl = $("#detailBullets_feature_div").first();
		if (!categoriesEl.length) return [];

		const categories: string[] = [];
		categoriesEl.find(".zg_hrsr .a-list-item a").each((_, el) => {
			const text = $(el).text().replace("(Books)", "").trim();
			if (text) categories.push(text);
		});

		return [...new Set(categories)];
	}

	// ─── Helpers ─────────────────────────────────────────

	private extractFromDetailBullets(
		$: cheerio.CheerioAPI,
		keyPart: string,
	): string | null {
		const featureEl = $("#detailBullets_feature_div");
		if (!featureEl.length) return null;

		const listItems = featureEl.find("li");
		for (let i = 0; i < listItems.length; i++) {
			const li = $(listItems[i]);
			const boldEl = li.find("span.a-text-bold").first();
			if (boldEl.length && boldEl.text().includes(keyPart)) {
				const valueSpan = boldEl.next("span");
				if (valueSpan.length) {
					return this.cleanIsbn(valueSpan.text());
				}
			}
		}

		return null;
	}

	private cleanIsbn(text: string): string {
		return text.replace(/[^0-9Xx-]/g, "").trim();
	}

	private parseDate(dateString: string): string | null {
		if (!dateString) return null;

		// Try ISO format first
		const isoMatch = dateString.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
		if (isoMatch) return dateString;

		// Try common date patterns
		const patterns = [
			// "March 15, 2024" / "Mar 15, 2024"
			/(\w+)\s+(\d{1,2}),?\s+(\d{4})/,
			// "15 March 2024" / "15. March 2024"
			/(\d{1,2})\.?\s+(\w+)\s+(\d{4})/,
			// "2024/3/15" / "2024/03/15"
			/(\d{4})\/(\d{1,2})\/(\d{1,2})/,
			// "2024年3月15日"
			/(\d{4})年(\d{1,2})月(\d{1,2})日/,
		];

		for (const pattern of patterns) {
			const match = dateString.match(pattern);
			if (match) {
				try {
					const date = new Date(dateString);
					if (!Number.isNaN(date.getTime())) {
						return date.toISOString().split("T")[0] ?? null;
					}
				} catch {
					// Continue to next pattern
				}
			}
		}

		// Last resort: try native Date parsing
		try {
			const date = new Date(dateString);
			if (!Number.isNaN(date.getTime())) {
				return date.toISOString().split("T")[0] ?? null;
			}
		} catch {
			// Give up
		}

		return null;
	}

	// ─── HTTP ────────────────────────────────────────────

	private currentUaIndex = Math.floor(Math.random() * USER_AGENT_POOL.length);
	private consecutiveFailures = 0;

	private rotateUserAgent(): void {
		this.currentUaIndex = (this.currentUaIndex + 1) % USER_AGENT_POOL.length;
	}

	// Detects an HTTP-200 anti-bot wall (captcha page or tiny throttle stub),
	// distinct from a legitimate large "no results" page.
	private looksLikeBlockPage(html: string): boolean {
		if (BLOCK_PAGE_MARKERS.some((m) => html.includes(m))) return true;
		// Real pages are hundreds of KB; a small 200 body is a block shell,
		// whether or not it carries a <title> (captcha pages do).
		return html.length < MIN_REAL_PAGE_BYTES;
	}

	private async fetchPage(
		url: string,
		config: AmazonConfig,
		attempt = 0,
	): Promise<cheerio.CheerioAPI | null> {
		await this.throttle(!!config.cookie);

		const headers = this.getHeaders(config.domain, config.cookie);

		try {
			const response = await fetch(url, { headers, redirect: "follow" });

			const statusBlocked =
				response.status === 429 ||
				response.status === 503 ||
				response.status === 500;

			// Read the body up front so we can also catch HTTP-200 block stubs.
			const html = response.ok ? await response.text() : null;
			const softBlocked = html != null && this.looksLikeBlockPage(html);

			if (statusBlocked || softBlocked) {
				this.consecutiveFailures++;
				this.rotateUserAgent(); // rotate identity on block

				const reason = statusBlocked
					? `status ${response.status}`
					: "block page (HTTP 200)";

				if (attempt < MAX_RETRIES) {
					// Exponential backoff: 5s, 15s, 45s + jitter
					const backoff = 3 ** (attempt + 1) * 5000 + Math.random() * 3000;
					log.warn(
						{
							reason,
							attempt: attempt + 1,
							maxRetries: MAX_RETRIES,
							retryInSeconds: Math.round(backoff / 1000),
						},
						"Anti-bot block, retrying",
					);
					await Bun.sleep(backoff);
					return this.fetchPage(url, config, attempt + 1);
				}

				throw new AmazonTransientError(
					`Anti-scraping ${reason} after ${MAX_RETRIES} retries for ${url}`,
				);
			}

			if (!response.ok || html == null) {
				log.warn({ status: response.status, url }, "HTTP error");
				return null;
			}

			this.consecutiveFailures = 0; // reset on success
			return cheerio.load(html);
		} catch (error) {
			if (error instanceof AmazonTransientError) throw error;
			throw new AmazonTransientError(`Fetch error for ${url}: ${error}`);
		}
	}

	private getHeaders(domain: string, cookie?: string): Record<string, string> {
		const acceptLanguage = DOMAIN_LOCALE_MAP[domain] ?? "en-US,en;q=0.9";
		const profile = USER_AGENT_POOL[this.currentUaIndex];
		if (!profile) throw new Error("USER_AGENT_POOL is empty");

		const headers: Record<string, string> = {
			accept:
				"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
			"accept-encoding": "gzip, deflate, br",
			"accept-language": acceptLanguage,
			"cache-control": "max-age=0",
			"user-agent": profile.ua,
			"sec-ch-ua": profile.secChUa,
			"sec-ch-ua-mobile": profile.mobile,
			"sec-ch-ua-platform": profile.platform,
			"sec-ch-ua-platform-version": profile.platformVersion,
			"sec-fetch-dest": "document",
			"sec-fetch-mode": "navigate",
			"sec-fetch-site": "none",
			"sec-fetch-user": "?1",
			"upgrade-insecure-requests": "1",
			"viewport-width": String(1280 + Math.floor(Math.random() * 640)),
			dnt: Math.random() > 0.5 ? "1" : "0",
		};

		if (cookie) {
			headers.cookie = cookie;
		}

		return headers;
	}

	private async throttle(hasCookie: boolean): Promise<void> {
		// If too many consecutive failures, invalidate config cache and stop
		if (this.consecutiveFailures >= BLOCK_THRESHOLD) {
			this.configCache.clear();
			throw new AmazonTransientError(
				`Blocked: ${this.consecutiveFailures} consecutive failures. ${hasCookie ? "Cookie may have expired." : "Consider adding a cookie."}`,
			);
		}

		// Reserve the next slot off the shared chain: one request at a time,
		// spaced by the (cookie-aware) delay, even under concurrent callers.
		const wait = this.gate.then(async () => {
			const minDelay = hasCookie ? MIN_DELAY_COOKIE_MS : MIN_DELAY_MS;
			const maxDelay = hasCookie ? MAX_DELAY_COOKIE_MS : MAX_DELAY_MS;
			const delay = minDelay + Math.random() * (maxDelay - minDelay);
			const sleepFor = Math.max(0, this.nextAllowedAt - Date.now());
			if (sleepFor > 0) await Bun.sleep(sleepFor);
			this.nextAllowedAt = Date.now() + delay;
		});
		// Keep the chain alive even if this waiter throws/cancels.
		this.gate = wait.catch(() => {});
		await wait;
	}

	// ─── Config Cache (5 min TTL) ────────────────────────

	private async getConfig(
		serverId: string | null | undefined,
	): Promise<AmazonConfig> {
		// Library-less books have no organization → default store, no cookie.
		if (!serverId) return { domain: "co.jp", enabled: true };

		const now = Date.now();
		const cached = this.configCache.get(serverId);
		if (cached && now - cached.at < 5 * 60 * 1000) {
			return cached.config;
		}
		const config = await getAmazonConfig(serverId);
		this.configCache.set(serverId, { config, at: now });
		this.consecutiveFailures = 0;
		return config;
	}

	// ─── Cover Download ──────────────────────────────────

	private async downloadCover(
		imageUrl: string,
		uuid: string,
	): Promise<string | null> {
		try {
			const response = await fetch(imageUrl);
			if (!response.ok) return null;

			const buffer = Buffer.from(await response.arrayBuffer());

			const urlExt = path.extname(new URL(imageUrl).pathname).toLowerCase();
			const ext = urlExt && urlExt !== "." ? urlExt : ".jpg";

			const coversDir = path.join(process.cwd(), "data/covers");
			if (!this.coversDirCreated) {
				await fs.mkdir(coversDir, { recursive: true });
				this.coversDirCreated = true;
			}

			const coverPath = path.join(coversDir, `${uuid}${ext}`);

			await fs.writeFile(coverPath, buffer, { flag: "wx" }).catch(() => {
				// File already exists, skip writing
			});

			return path.relative(process.cwd(), coverPath);
		} catch (error) {
			log.warn({ err: error }, "Cover download failed");
			return null;
		}
	}
}

export const amazonProvider = new AmazonProvider();
