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
	series?: { asin?: string; title: string; sequence?: string }[];
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
	// A provider sequence may be Japanese or season-prefixed. A range or a
	// named special has no single numeric position; keep the membership anyway.
	const normalized = pos.normalize("NFKC").trim();
	const sequence = normalized.match(
		/^(?:[^\d:]+:\s*)?(?:(?:第|Lv\.?|Vol\.?|Book)\s*)?(\d+(?:\.\d+)?)(?:\s*巻)?$/iu,
	)?.[1];
	return sequence === undefined ? null : Number(sequence);
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

async function getCatalogProduct(asin: string, region: string) {
	const url = `${AUDIBLE_CATALOG_BASE}${getTld(region)}/1.0/catalog/products/${encodeURIComponent(asin)}?response_groups=product_attrs,contributors,series,media`;
	const data = await fetchJson<{ product?: AudibleCatalogProduct }>(url);
	// Never hydrate the requested book with a substituted or malformed result.
	return data?.product?.asin?.toUpperCase() === asin.toUpperCase()
		? data.product
		: null;
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

	const primarySeries = product.series?.[0];
	if (primarySeries?.title) {
		result.series = {
			name: primarySeries.title,
			position: parsePosition(primarySeries.sequence),
		};
	}

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
			const asin = title.trim().toUpperCase();
			const result = await this.lookup(asin, region);
			return result
				? [
						{
							...result.metadata,
							previewCover: result.image
								? upgradeAmazonImageUrl(result.image)
								: undefined,
							provider: "audible",
							providerId: asin,
							url: audibleProductUrl(asin, region),
						},
					]
				: [];
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
		const result = await this.lookup(providerId, options?.region ?? "us");
		if (!result) return null;
		if (result.image && options?.bookUuid) {
			const cover = await downloadCover(
				upgradeAmazonImageUrl(result.image),
				options.bookUuid,
				log,
			);
			if (cover) result.metadata.cover = cover;
		}
		return result.metadata;
	}

	private async lookup(providerId: string, region: string) {
		const book = await getAudnexusBook(providerId, region);
		const catalog = book?.seriesPrimary?.name
			? null
			: await getCatalogProduct(providerId, region);
		if (!book && !catalog) return null;

		const metadata = book ? mapAudnexusToMetadata(book, null) : {};
		if (catalog) {
			const {
				provider: _provider,
				providerId: _id,
				url: _url,
				previewCover: _preview,
				...fields
			} = mapCatalogProductToCandidate(catalog, region);
			if (!book) Object.assign(metadata, fields);
			else if (fields.series) metadata.series = fields.series;
		}
		if (!metadata.series && book?.seriesSecondary?.name) {
			metadata.series = {
				name: book.seriesSecondary.name,
				position: parsePosition(book.seriesSecondary.position),
			};
		}
		const image = book?.image ?? catalog?.product_images?.["500"];
		return { metadata, image };
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
