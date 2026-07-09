import * as fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { logger } from "../../../../lib/logger";
import {
	isSafePublicUrl,
	MAX_REMOTE_IMAGE_BYTES,
} from "../../../../lib/safe-url";
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
// Circuit breaker: after BLOCK_THRESHOLD consecutive blocks on a domain, fail
// fast for this long, then probe again with a fresh failure budget.
const BLOCK_COOLDOWN_MS = 5 * 60 * 1000;

// Dedupe caches: series siblings re-search the same "series 1" query and
// re-fetch the same vol-1/candidate pages. Only successful fetches are cached
// (never blocks/HTTP errors), so a hit returns exactly what a fresh fetch
// would have parsed.
const PAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PAGE_CACHE_MAX_ENTRIES = 5000;
const SEARCH_CACHE_MAX_ENTRIES = 2000;

// AIMD pacing per domain: shrink delays on success streaks, back off hard on
// any block. Bounded so the floor stays polite and blocks recover quickly.
const DELAY_DECAY = 0.98;
const DELAY_GROWTH = 1.8;
const MIN_DELAY_FACTOR = 0.7;
const MAX_DELAY_FACTOR = 3;

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

// ─── Caching / per-domain state ──────────────────────────

class TtlCache<V> {
	private map = new Map<string, { value: V; expiresAt: number }>();

	constructor(
		private ttlMs: number,
		private maxEntries: number,
	) {}

	get(key: string): V | undefined {
		const entry = this.map.get(key);
		if (!entry) return undefined;
		if (Date.now() > entry.expiresAt) {
			this.map.delete(key);
			return undefined;
		}
		return entry.value;
	}

	set(key: string, value: V): void {
		if (!this.map.has(key) && this.map.size >= this.maxEntries) {
			const oldest = this.map.keys().next().value;
			if (oldest !== undefined) this.map.delete(oldest);
		}
		this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
	}

	clear(): void {
		this.map.clear();
	}
}

// Each Amazon domain is an independent host with its own rate limit: pacing,
// failure counting, adaptive delay, and session cookies must not couple e.g.
// co.jp and com tenants to each other.
type DomainState = {
	gate: Promise<void>;
	nextAllowedAt: number;
	consecutiveFailures: number;
	cooldownUntil: number;
	delayFactor: number;
	cookieJar: Map<string, string>;
};

// ─── Amazon Provider ─────────────────────────────────────

class AmazonProvider implements IMetadataProvider {
	private domains = new Map<string, DomainState>();
	// Parsed product pages by `${domain}:${asin}` (dud/landing parses included,
	// so repeated fall-throughs don't refetch them).
	private pageCache = new TtlCache<Partial<BookMetadata>>(
		PAGE_CACHE_TTL_MS,
		PAGE_CACHE_MAX_ENTRIES,
	);
	// Ranked candidate ASINs keyed by URL + every filter input that affects the
	// selection, so a hit is exactly what re-running the search would return.
	private searchCache = new TtlCache<string[]>(
		PAGE_CACHE_TTL_MS,
		SEARCH_CACHE_MAX_ENTRIES,
	);
	// Coalesce concurrent identical lookups: enrich jobs run in parallel, so
	// series siblings can request the same search/page while the first fetch is
	// still in flight — they must share it, not queue duplicates on the gate.
	private inflightPages = new Map<
		string,
		Promise<Partial<BookMetadata> | null>
	>();
	private inflightSearches = new Map<string, Promise<string[]>>();
	// Cached per org: domain/cookie are tenant-scoped, so a shared cache would
	// leak one tenant's config into another's through this singleton.
	private configCache = new Map<string, { config: AmazonConfig; at: number }>();
	private coversDirCreated = false;

	private domainState(domain: string): DomainState {
		let state = this.domains.get(domain);
		if (!state) {
			state = {
				gate: Promise.resolve(),
				nextAllowedAt: 0,
				consecutiveFailures: 0,
				cooldownUntil: 0,
				delayFactor: 1,
				cookieJar: new Map(),
			};
			this.domains.set(domain, state);
		}
		return state;
	}

	/** Drop caches and per-domain session state (tests/ops). */
	clearCaches(): void {
		this.pageCache.clear();
		this.searchCache.clear();
		this.inflightPages.clear();
		this.inflightSearches.clear();
		this.domains.clear();
	}

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

			let metadata: Partial<BookMetadata> = {};

			if (asin) {
				metadata = (await this.fetchBookMetadata(asin, config)) ?? {};
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
					const parsed = await this.fetchBookMetadata(candidate, config);
					if (parsed?.title) {
						asin = candidate;
						metadata = parsed;
						break;
					}
				}
			}

			// No usable book page (all candidates were series/landing pages).
			if (!metadata.title) return {};

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
					const parsedVol1 = await this.fetchBookMetadata(vol1Asin, config);
					if (parsedVol1) {
						asin = vol1Asin;
						metadata = parsedVol1;
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
		// Key on every argument that changes the selection below — a hit must be
		// indistinguishable from re-running the search against the same page.
		const cacheKey = [searchUrl, inputTitle ?? "", inputHasVolume, inputIsBonus]
			.map(String)
			.join("\u0000");
		const cachedAsins = this.searchCache.get(cacheKey);
		if (cachedAsins) {
			log.info({ searchUrl, count: cachedAsins.length }, "Search cache hit");
			return [...cachedAsins];
		}

		let inflight = this.inflightSearches.get(cacheKey);
		if (!inflight) {
			inflight = this.loadSearchCandidates(
				searchUrl,
				config,
				cacheKey,
				inputTitle,
				inputHasVolume,
				inputIsBonus,
			).finally(() => this.inflightSearches.delete(cacheKey));
			this.inflightSearches.set(cacheKey, inflight);
		} else {
			log.info({ searchUrl }, "Coalesced concurrent search");
		}
		return [...(await inflight)];
	}

	private async loadSearchCandidates(
		searchUrl: string,
		config: AmazonConfig,
		cacheKey: string,
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
			this.searchCache.set(cacheKey, []);
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

		if (candidates.length === 0) {
			this.searchCache.set(cacheKey, []);
			return [];
		}

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

		const asins = candidates.map((c) => c.asin);
		this.searchCache.set(cacheKey, asins);
		return asins;
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

	// Fetch + parse a product page, memoized per domain+ASIN and coalesced while
	// in flight. Dud parses (series/landing pages without a title) are cached
	// too so fall-throughs don't refetch them; fetch failures (null) and errors
	// are never cached. Every caller gets a clone so mutating the result (e.g.
	// cover rewrite) can't poison the cache.
	private async fetchBookMetadata(
		asin: string,
		config: AmazonConfig,
	): Promise<Partial<BookMetadata> | null> {
		const cacheKey = `${config.domain}:${asin}`;
		const cached = this.pageCache.get(cacheKey);
		if (cached) {
			log.info({ asin, domain: config.domain }, "Product page cache hit");
			return structuredClone(cached);
		}

		let inflight = this.inflightPages.get(cacheKey);
		if (!inflight) {
			inflight = this.loadBookMetadata(asin, config, cacheKey).finally(() =>
				this.inflightPages.delete(cacheKey),
			);
			this.inflightPages.set(cacheKey, inflight);
		} else {
			log.info(
				{ asin, domain: config.domain },
				"Coalesced concurrent product page request",
			);
		}
		const parsed = await inflight;
		return parsed ? structuredClone(parsed) : null;
	}

	private async loadBookMetadata(
		asin: string,
		config: AmazonConfig,
		cacheKey: string,
	): Promise<Partial<BookMetadata> | null> {
		const $ = await this.fetchPage(
			`https://www.amazon.${config.domain}/dp/${asin}`,
			config,
		);
		if (!$) return null;

		const parsed = this.parseBookPage($, asin);
		this.pageCache.set(cacheKey, parsed);
		return parsed;
	}

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
		await this.throttle(config.domain, !!config.cookie);

		const state = this.domainState(config.domain);
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
				state.consecutiveFailures++;
				state.delayFactor = Math.min(
					MAX_DELAY_FACTOR,
					state.delayFactor * DELAY_GROWTH,
				);
				if (state.consecutiveFailures >= BLOCK_THRESHOLD) {
					state.cooldownUntil = Date.now() + BLOCK_COOLDOWN_MS;
					// Re-read tenant config after the cooldown: the fix for a
					// persistent block is usually a fresh cookie.
					this.configCache.clear();
				}
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

			state.consecutiveFailures = 0; // reset on success
			state.delayFactor = Math.max(
				MIN_DELAY_FACTOR,
				state.delayFactor * DELAY_DECAY,
			);
			this.absorbSetCookies(state, response);
			return cheerio.load(html);
		} catch (error) {
			if (error instanceof AmazonTransientError) throw error;
			throw new AmazonTransientError(`Fetch error for ${url}: ${error}`);
		}
	}

	// Keep Amazon's session cookies (session-id, ubid-*, …) so follow-up
	// requests look like one browser session instead of a fresh client each
	// time. Only successful responses feed the jar.
	private absorbSetCookies(state: DomainState, response: Response): void {
		const setCookies = response.headers.getSetCookie?.() ?? [];
		for (const raw of setCookies) {
			const pair = raw.split(";")[0] ?? "";
			const eq = pair.indexOf("=");
			if (eq <= 0) continue;
			const name = pair.slice(0, eq).trim();
			const value = pair.slice(eq + 1).trim();
			if (name) state.cookieJar.set(name, value);
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

		// Configured tenant cookie wins over captured session cookies on conflict.
		const configured = (cookie ?? "").trim().replace(/;$/, "");
		const configuredNames = new Set(
			configured
				.split(";")
				.map((part) => part.split("=")[0]?.trim())
				.filter(Boolean),
		);
		const jarPairs = [...this.domainState(domain).cookieJar]
			.filter(([name]) => !configuredNames.has(name))
			.map(([name, value]) => `${name}=${value}`);
		const cookieParts = [configured, ...jarPairs].filter(Boolean);
		if (cookieParts.length > 0) {
			headers.cookie = cookieParts.join("; ");
		}

		return headers;
	}

	private async throttle(domain: string, hasCookie: boolean): Promise<void> {
		const state = this.domainState(domain);

		// Circuit breaker: fail fast while the cooldown runs, then probe again
		// with a fresh failure budget.
		if (state.consecutiveFailures >= BLOCK_THRESHOLD) {
			if (Date.now() < state.cooldownUntil) {
				throw new AmazonTransientError(
					`Blocked: ${state.consecutiveFailures} consecutive failures. ${hasCookie ? "Cookie may have expired." : "Consider adding a cookie."}`,
				);
			}
			state.consecutiveFailures = 0;
		}

		// Reserve the next slot off the domain's chain: one request at a time per
		// domain, spaced by the (cookie-aware, AIMD-scaled) delay, even under
		// concurrent callers.
		const wait = state.gate.then(async () => {
			const minDelay =
				(hasCookie ? MIN_DELAY_COOKIE_MS : MIN_DELAY_MS) * state.delayFactor;
			const maxDelay =
				(hasCookie ? MAX_DELAY_COOKIE_MS : MAX_DELAY_MS) * state.delayFactor;
			const delay = minDelay + Math.random() * (maxDelay - minDelay);
			const sleepFor = Math.max(0, state.nextAllowedAt - Date.now());
			if (sleepFor > 0) await Bun.sleep(sleepFor);
			state.nextAllowedAt = Date.now() + delay;
		});
		// Keep the chain alive even if this waiter throws/cancels.
		state.gate = wait.catch(() => {});
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
		return config;
	}

	// ─── Cover Download ──────────────────────────────────

	private async downloadCover(
		imageUrl: string,
		uuid: string,
	): Promise<string | null> {
		try {
			if (!isSafePublicUrl(imageUrl)) {
				log.warn({ imageUrl }, "Refusing to fetch cover from unsafe URL");
				return null;
			}
			const response = await fetch(imageUrl, { redirect: "error" });
			if (!response.ok) return null;

			const contentLength = Number(response.headers.get("content-length"));
			if (
				Number.isFinite(contentLength) &&
				contentLength > MAX_REMOTE_IMAGE_BYTES
			) {
				return null;
			}

			const buffer = Buffer.from(await response.arrayBuffer());
			if (buffer.byteLength > MAX_REMOTE_IMAGE_BYTES) return null;

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
