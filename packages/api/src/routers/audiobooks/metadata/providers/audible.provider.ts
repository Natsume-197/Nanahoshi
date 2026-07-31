import { upgradeAmazonImageUrl } from "../../../../lib/cover-store";
import { logger } from "../../../../lib/logger";
import type { AudiobookMetadata } from "../audiobook-metadata.model";
import {
	type AudiobookSearchCandidate,
	type IAudiobookMetadataProvider,
	isValidAsin,
	type ProviderChapters,
	type ProviderRequestOptions,
} from "./IMetadata.provider";
import {
	createThrottledFetchJson,
	downloadCover,
	stripHtml,
} from "./provider.helpers";

const log = logger.child({ component: "audible-provider" });

// ─── Constants ───────────────────────────────────────────

const AUDNEXUS_BASE = "https://api.audnex.us";
const AUDIBLE_CATALOG_BASE = "https://api.audible";

/** Minimum delay between requests to avoid rate limiting (100 req/min on Audnexus) */
const fetchJson = createThrottledFetchJson({ minDelayMs: 650, log });

const REGION_TLD_MAP: Record<string, string> = {
	us: ".com",
	uk: ".co.uk",
	au: ".com.au",
	ca: ".ca",
	de: ".de",
	es: ".es",
	fr: ".fr",
	in: ".in",
	it: ".it",
	jp: ".co.jp",
};

// ─── Types ───────────────────────────────────────────────

type AudibleCatalogProduct = {
	asin: string;
	title?: string;
	subtitle?: string;
	authors?: { asin?: string; name: string }[];
	narrators?: { name: string }[];
	publisher_name?: string;
	release_date?: string;
	runtime_length_min?: number;
	language?: string;
	product_images?: Record<string, string>;
};

type AudnexusBook = {
	asin: string;
	title: string;
	subtitle?: string;
	authors: { asin?: string; name: string }[];
	narrators?: { asin?: string; name: string }[];
	description?: string;
	summary?: string;
	image?: string;
	language?: string;
	publisherName?: string;
	releaseDate?: string;
	runtimeLengthMin?: number;
	formatType?: string;
	rating?: string;
	region?: string;
	genres?: { asin: string; name: string; type: string }[];
	seriesPrimary?: { asin?: string; name: string; position?: string };
	seriesSecondary?: { asin?: string; name: string; position?: string };
	isbn?: string;
};

type AudnexusChapters = {
	asin: string;
	chapters: {
		lengthMs: number;
		startOffsetMs: number;
		startOffsetSec: number;
		title: string;
	}[];
	runtimeLengthMs: number;
	runtimeLengthSec: number;
};

// ─── Helpers ─────────────────────────────────────────────

function getTld(region: string): string {
	return REGION_TLD_MAP[region] ?? ".com";
}

function parsePosition(pos: string | undefined): number | null {
	if (!pos) return null;
	const num = Number.parseFloat(pos);
	return Number.isFinite(num) ? num : null;
}

// ─── Audible Catalog Search ──────────────────────────────

async function searchAudibleCatalog(
	title: string,
	author: string | undefined,
	region: string,
	limit = 10,
): Promise<AudibleCatalogProduct[]> {
	const tld = getTld(region);
	// keywords instead of title=/author=, and no products_sort_by: that combo
	// returns zero results on non-US marketplaces (verified against .co.jp).
	const params = new URLSearchParams({
		num_results: String(limit),
		keywords: [title, author].filter(Boolean).join(" "),
		response_groups: "product_attrs,contributors,series,media",
	});

	const url = `${AUDIBLE_CATALOG_BASE}${tld}/1.0/catalog/products?${params}`;
	const data = await fetchJson<{ products?: AudibleCatalogProduct[] }>(url);
	return data?.products ?? [];
}

// ─── Audnexus Enrichment ─────────────────────────────────

async function getAudnexusBook(
	asin: string,
	region: string,
): Promise<AudnexusBook | null> {
	const url = `${AUDNEXUS_BASE}/books/${encodeURIComponent(asin)}?region=${region}`;
	return fetchJson<AudnexusBook>(url);
}

async function getAudnexusChapters(
	asin: string,
	region: string,
): Promise<AudnexusChapters | null> {
	const url = `${AUDNEXUS_BASE}/books/${encodeURIComponent(asin)}/chapters?region=${region}`;
	return fetchJson<AudnexusChapters>(url);
}

// ─── Map to AudiobookMetadata ────────────────────────────

function mapAudnexusToMetadata(
	book: AudnexusBook,
	coverPath: string | null,
): Partial<AudiobookMetadata> {
	const result: Partial<AudiobookMetadata> = {
		title: book.title || undefined,
		subtitle: book.subtitle || undefined,
		description: book.summary
			? stripHtml(book.summary)
			: book.description
				? stripHtml(book.description)
				: undefined,
		asin: book.asin,
		isbn: book.isbn || undefined,
		languageCode: book.language || undefined,
		publishedDate: book.releaseDate || undefined,
		duration: book.runtimeLengthMin ? book.runtimeLengthMin * 60 : undefined,
		abridged: book.formatType === "abridged" ? true : undefined,
	};

	if (coverPath) {
		result.cover = coverPath;
	}

	if (book.authors?.length) {
		result.authors = book.authors.map((a) => ({
			name: a.name,
			role: "Author",
		}));
	}

	if (book.narrators?.length) {
		result.narrators = book.narrators.map((n) => ({ name: n.name }));
	}

	if (book.publisherName) {
		result.publisher = { name: book.publisherName };
	}

	if (book.seriesPrimary?.name) {
		result.series = {
			name: book.seriesPrimary.name,
			position: parsePosition(book.seriesPrimary.position),
		};
	}

	if (book.genres?.length) {
		// Audnexus mixes both facets in `genres`, discriminated by `type`
		const genres = book.genres.filter((g) => g.type !== "tag");
		const tags = book.genres.filter((g) => g.type === "tag");
		if (genres.length) result.genres = genres.map((g) => g.name);
		if (tags.length) result.tags = tags.map((g) => g.name);
	}

	if (book.rating) {
		const rating = Number.parseFloat(book.rating);
		if (Number.isFinite(rating)) {
			result.audibleRating = rating;
		}
	}

	return result;
}

function audibleProductUrl(asin: string, region: string): string {
	return `https://www.audible${getTld(region)}/pd/${asin}`;
}

function mapCatalogProductToCandidate(
	product: AudibleCatalogProduct,
	region: string,
): AudiobookSearchCandidate {
	const result: AudiobookSearchCandidate = {
		provider: "audible",
		providerId: product.asin,
		url: audibleProductUrl(product.asin, region),
		title: product.title || undefined,
		subtitle: product.subtitle || undefined,
		asin: product.asin,
		publishedDate: product.release_date || undefined,
		languageCode: product.language || undefined,
		duration: product.runtime_length_min
			? product.runtime_length_min * 60
			: undefined,
	};

	const images = product.product_images;
	if (images) {
		const best = images["500"] ?? Object.values(images)[0];
		if (best) result.previewCover = upgradeAmazonImageUrl(best);
	}

	if (product.authors?.length) {
		result.authors = product.authors.map((a) => ({
			name: a.name,
			role: "Author",
		}));
	}

	if (product.narrators?.length) {
		result.narrators = product.narrators.map((n) => ({ name: n.name }));
	}

	if (product.publisher_name) {
		result.publisher = { name: product.publisher_name };
	}

	return result;
}

function mapAudnexusToCandidate(
	book: AudnexusBook,
	region: string,
): AudiobookSearchCandidate {
	return {
		...mapAudnexusToMetadata(book, null),
		provider: "audible",
		providerId: book.asin,
		previewCover: book.image ? upgradeAmazonImageUrl(book.image) : undefined,
		url: audibleProductUrl(book.asin, region),
	};
}

// ─── Provider Implementation ─────────────────────────────

class AudibleProvider implements IAudiobookMetadataProvider {
	readonly id = "audible" as const;

	// Search the Audible catalog by title/author; lightweight catalog results
	// (no Audnexus enrichment yet). An ASIN as the search term short-circuits
	// to a direct Audnexus lookup — that path is not geo-blocked, unlike the
	// catalog search (JP titles are invisible from non-JP IPs).
	async search(
		input: { title?: string; authors?: { name: string }[] },
		options?: ProviderRequestOptions,
	): Promise<AudiobookSearchCandidate[]> {
		const title = input.title;
		if (!title) return [];

		const region = options?.region ?? "us";

		if (isValidAsin(title)) {
			const book = await getAudnexusBook(title.trim().toUpperCase(), region);
			return book ? [mapAudnexusToCandidate(book, region)] : [];
		}

		const authorName = input.authors?.[0]?.name;
		const products = await searchAudibleCatalog(title, authorName, region);

		return products.map((product) =>
			mapCatalogProductToCandidate(product, region),
		);
	}

	// Full enriched metadata for an audiobook by ASIN via Audnexus; downloads the
	// cover art.
	async getById(
		providerId: string,
		options?: ProviderRequestOptions & { bookUuid?: string },
	): Promise<Partial<AudiobookMetadata> | null> {
		const region = options?.region ?? "us";
		const book = await getAudnexusBook(providerId, region);
		if (!book) return null;

		let coverPath: string | null = null;
		if (book.image && options?.bookUuid) {
			coverPath = await downloadCover(
				upgradeAmazonImageUrl(book.image),
				options.bookUuid,
				log,
			);
		}

		return mapAudnexusToMetadata(book, coverPath);
	}

	// Chapter data for an audiobook by ASIN.
	async getChapters(
		providerId: string,
		options?: ProviderRequestOptions,
	): Promise<ProviderChapters | null> {
		const data = await getAudnexusChapters(providerId, options?.region ?? "us");
		if (!data?.chapters?.length) return null;
		return {
			chapters: data.chapters.map((ch) => ({
				title: ch.title ?? null,
				startTime: ch.startOffsetSec,
				endTime: ch.startOffsetSec + ch.lengthMs / 1000,
			})),
		};
	}
}

export const audibleProvider = new AudibleProvider();
