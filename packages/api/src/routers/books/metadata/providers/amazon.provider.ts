import * as fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import {
	type AmazonConfig,
	getAmazonConfig,
} from "../../../../modules/settings.service";
import type { BookMetadata } from "../book.metadata.model";
import type { IMetadataProvider } from "./IMetadata.provider";

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
const MIN_DELAY_COOKIE_MS = 1500;
const MAX_DELAY_COOKIE_MS = 2500;
const MAX_RETRIES = 3;
const BLOCK_THRESHOLD = 3;

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

const NON_ALPHANUMERIC_PATTERN = /[^\p{L}\p{M}0-9]/gu;
const NON_DIGIT_PATTERN = /[^\d]/g;
// Matches series position in various formats:
// EN: "Book 3 of 15"
// JP pattern 1: "3巻 (全15巻)"
// JP pattern 2: "全17冊中3番目の本"
// Detects volume/part indicators in titles:
// Arabic digits, Roman numerals (II+), kanji part/volume markers (第四部, 第三巻, etc.)
const HAS_VOLUME_PATTERN =
	/[\d０-９]+|(?<![a-zA-Z])[IVXLCivxlc]{2,}(?![a-zA-Z])|第[一二三四五六七八九十百千]+[部巻章編話]/;

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

// Series card indicators in search results (not individual books)
// Phrases specific to series LANDING pages in search results.
// Be careful: individual books that belong to a series may show
// "Kindleシリーズ" or "book series" in their card, so avoid those.
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

// ─── Amazon Provider ─────────────────────────────────────

class AmazonProvider implements IMetadataProvider {
	private lastRequestTime = 0;
	private cachedConfig: AmazonConfig | null = null;
	private configFetchedAt = 0;
	private coversDirCreated = false;

	async getMetadata(
		input: Partial<BookMetadata> & { bookId?: number; uuid?: string },
	): Promise<Partial<BookMetadata>> {
		try {
			const config = await this.getConfig();
			if (!config.enabled) return {};

			// If we already have an ASIN, go directly to the book page
			let asin = input.asin ?? null;

			const inputHasVolume = input.title
				? HAS_VOLUME_PATTERN.test(input.title)
				: false;
			const inputIsBonus = input.title
				? BONUS_CONTENT_PHRASES.some((p) => input.title!.includes(p))
				: false;

			if (!asin) {
				// Build search query and search
				const searchUrl = this.buildSearchUrl(input, config.domain);
				if (!searchUrl) return {};

				asin = await this.searchForAsin(
					searchUrl,
					config,
					input.title,
					inputHasVolume,
					inputIsBonus,
				);
				if (!asin) return {};
			}

			// Fetch the book page
			const bookUrl = `https://www.amazon.${config.domain}/dp/${asin}`;
			let $ = await this.fetchPage(bookUrl, config);
			if (!$) return {};

			let metadata = this.parseBookPage($, asin);

			// Validate this is an actual book page (not a series landing page).
			// Series pages don't have #productTitle, so parseBookPage returns no title.
			if (!metadata.title) return {};

			// If input has no volume number but we got a later volume,
			// search again specifically for vol 1 using the series name.
			// Don't redirect if the input is bonus content.
			if (
				!inputHasVolume &&
				!inputIsBonus &&
				metadata.series?.position != null &&
				metadata.series.position > 1 &&
				metadata.series.name
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

			// Download cover if we got one and input doesn't already have one
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
			console.warn("[AmazonProvider] Error fetching metadata:", error);
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
				parts.push(this.cleanSearchTerm(firstAuthor));
			}
		}

		if (parts.length === 0) return null;

		const query = parts.join(" ");
		// i=digital-text restricts to Kindle Store (ebooks only)
		return `https://www.amazon.${domain}/s?k=${encodeURIComponent(query)}&i=digital-text`;
	}

	private cleanSearchTerm(text: string): string {
		return (
			text
				// Remove brackets, quotes, and decorative punctuation
				.replace(/[「」『』【】（）()[\]{}～~・]/g, " ")
				// Remove decorative hyphens/dashes (common in JP titles like "-kuu-")
				.replace(/[-−–—]+/g, " ")
				// Remove Japanese legal entity prefixes (too specific for search)
				.replace(/株式会社|有限会社/g, "")
				.replace(/\s+/g, " ")
				.trim()
		);
	}

	private async searchForAsin(
		searchUrl: string,
		config: AmazonConfig,
		inputTitle?: string,
		inputHasVolume = true,
		inputIsBonus = false,
	): Promise<string | null> {
		console.log(`[AmazonProvider] Searching: ${searchUrl}`);
		const $ = await this.fetchPage(searchUrl, config);
		if (!$) return null;

		const searchResults = $(
			"span[data-component-type='s-search-results']",
		).first();
		if (!searchResults.length) {
			console.log("[AmazonProvider] No search results container found");
			return null;
		}

		const items = searchResults.find("div[data-asin]");
		console.log(`[AmazonProvider] Found ${items.length} items`);
		const normalizedInput = inputTitle
			? this.normalizeForComparison(inputTitle)
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
				? this.normalizeForComparison(titleText)
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

		if (candidates.length === 0) return null;

		// Rank candidates:
		// 1. Prefer results whose title contains the full input (exact content match)
		// 2. Then by title length proximity to the input
		candidates.sort((a, b) => {
			if (normalizedInput) {
				const aContains = a.normalizedTitle.includes(normalizedInput) ? 0 : 1;
				const bContains = b.normalizedTitle.includes(normalizedInput) ? 0 : 1;
				if (aContains !== bContains) return aContains - bContains;
			}
			return (
				Math.abs(a.titleLength - inputLength) -
				Math.abs(b.titleLength - inputLength)
			);
		});

		console.log(
			`[AmazonProvider] Candidates for "${inputTitle}":`,
			candidates.map(
				(c) =>
					`${c.asin} (len=${c.titleLength}, diff=${Math.abs(c.titleLength - inputLength)}) "${c.title}"`,
			),
		);

		return candidates[0].asin;
	}

	private normalizeForComparison(text: string): string {
		return text
			.replace(/[０-９]/g, (ch) =>
				String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
			)
			.replace(NON_ALPHANUMERIC_PATTERN, "")
			.toLowerCase();
	}

	private isTitleSimilar(input: string, result: string): boolean {
		// If one contains the other, it's a match
		if (result.includes(input) || input.includes(result)) return true;

		// Extract numbers from both — volume numbers must match
		const inputNumbers = input.match(/\d+/g) ?? [];
		const resultNumbers = result.match(/\d+/g) ?? [];

		// If input has a volume number, the result must contain it
		if (inputNumbers.length > 0) {
			const hasMatchingNumber = inputNumbers.some((n) =>
				resultNumbers.includes(n),
			);
			if (!hasMatchingNumber) return false;
		}

		// Use character bigrams (2-char sequences) for similarity.
		// Single-char overlap is too loose for CJK — common particles
		// (に, の, は, が) and verb endings (された, ました) create false matches.
		const shorter = input.length <= result.length ? input : result;
		const longer = input.length > result.length ? input : result;

		if (shorter.length < 2) return longer.includes(shorter);

		let matchedBigrams = 0;
		const totalBigrams = shorter.length - 1;
		for (let i = 0; i < totalBigrams; i++) {
			if (longer.includes(shorter.slice(i, i + 2))) matchedBigrams++;
		}
		return matchedBigrams / totalBigrams >= 0.6;
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

		const extractFromContainer = (
			container: cheerio.Cheerio<cheerio.Element>,
		) => {
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
		let el: cheerio.Cheerio<cheerio.Element> | null = null;

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
		const reviewDiv = $("div#averageCustomerReviews_feature_div").first();
		if (!reviewDiv.length) return null;

		let ratingSpan = reviewDiv
			.find("span#acrPopover span.a-size-base.a-color-base")
			.first();
		if (!ratingSpan.length) {
			ratingSpan = reviewDiv
				.find("span#acrPopover span.a-size-small.a-color-base")
				.first();
		}

		if (!ratingSpan.length) return null;

		const text = ratingSpan.text().trim().replace(",", ".");
		const num = Number.parseFloat(text);
		return Number.isNaN(num) ? null : num;
	}

	private parseReviewCount($: cheerio.CheerioAPI): number | null {
		const reviewDiv = $("div#averageCustomerReviews_feature_div").first();
		if (!reviewDiv.length) return null;

		const countEl = reviewDiv.find("#acrCustomerReviewText").first();
		if (!countEl.length) return null;

		const raw = countEl.text().split(" ")[0] ?? "";
		const cleaned = raw.replace(NON_DIGIT_PATTERN, "");
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

	private async fetchPage(
		url: string,
		config: AmazonConfig,
		attempt = 0,
	): Promise<cheerio.CheerioAPI | null> {
		await this.throttle(!!config.cookie);

		const headers = this.getHeaders(config.domain, config.cookie);

		try {
			const response = await fetch(url, { headers, redirect: "follow" });

			if (
				response.status === 429 ||
				response.status === 503 ||
				response.status === 500
			) {
				this.consecutiveFailures++;
				this.rotateUserAgent(); // rotate identity on block

				if (attempt < MAX_RETRIES) {
					// Exponential backoff: 5s, 15s, 45s + jitter
					const backoff = 3 ** (attempt + 1) * 5000 + Math.random() * 3000;
					console.warn(
						`[AmazonProvider] HTTP ${response.status} (attempt ${attempt + 1}/${MAX_RETRIES}). Retrying in ${Math.round(backoff / 1000)}s...`,
					);
					await Bun.sleep(backoff);
					return this.fetchPage(url, config, attempt + 1);
				}

				throw new AmazonTransientError(
					`Anti-scraping response (${response.status}) after ${MAX_RETRIES} retries for ${url}`,
				);
			}

			if (!response.ok) {
				console.warn(`[AmazonProvider] HTTP ${response.status} for ${url}`);
				return null;
			}

			this.consecutiveFailures = 0; // reset on success
			const html = await response.text();
			return cheerio.load(html);
		} catch (error) {
			if (error instanceof AmazonTransientError) throw error;
			throw new AmazonTransientError(`Fetch error for ${url}: ${error}`);
		}
	}

	private getHeaders(domain: string, cookie?: string): Record<string, string> {
		const acceptLanguage = DOMAIN_LOCALE_MAP[domain] ?? "en-US,en;q=0.9";
		const profile = USER_AGENT_POOL[this.currentUaIndex]!;

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
			this.cachedConfig = null;
			this.configFetchedAt = 0;
			throw new AmazonTransientError(
				`Blocked: ${this.consecutiveFailures} consecutive failures. ${hasCookie ? "Cookie may have expired." : "Consider adding a cookie."}`,
			);
		}

		const now = Date.now();
		const elapsed = now - this.lastRequestTime;

		const minDelay = hasCookie ? MIN_DELAY_COOKIE_MS : MIN_DELAY_MS;
		const maxDelay = hasCookie ? MAX_DELAY_COOKIE_MS : MAX_DELAY_MS;
		const jitter = Math.random() * (maxDelay - minDelay);
		const delay = minDelay + jitter;

		if (elapsed < delay) {
			await Bun.sleep(delay - elapsed);
		}
		this.lastRequestTime = Date.now();
	}

	// ─── Config Cache (5 min TTL) ────────────────────────

	private async getConfig(): Promise<AmazonConfig> {
		const now = Date.now();
		if (this.cachedConfig && now - this.configFetchedAt < 5 * 60 * 1000) {
			return this.cachedConfig;
		}
		this.cachedConfig = await getAmazonConfig();
		this.configFetchedAt = now;
		this.consecutiveFailures = 0;
		return this.cachedConfig;
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
			console.warn("[AmazonProvider] Cover download failed:", error);
			return null;
		}
	}
}

export const amazonProvider = new AmazonProvider();
