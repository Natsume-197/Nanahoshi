import * as fs from "node:fs/promises";
import path from "node:path";
import type { AudiobookMetadata } from "../audiobook-metadata.model";
import type { IAudiobookMetadataProvider } from "./IMetadata.provider";

// ─── Constants ───────────────────────────────────────────

const AUDNEXUS_BASE = "https://api.audnex.us";
const AUDIBLE_CATALOG_BASE = "https://api.audible";
const COVERS_DIR = path.join(process.cwd(), "data/covers");
const REQUEST_TIMEOUT_MS = 15_000;

/** Minimum delay between requests to avoid rate limiting (100 req/min on Audnexus) */
const MIN_DELAY_MS = 650;
let lastRequestTime = 0;

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

async function throttle() {
	const now = Date.now();
	const elapsed = now - lastRequestTime;
	if (elapsed < MIN_DELAY_MS) {
		await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS - elapsed));
	}
	lastRequestTime = Date.now();
}

async function fetchJson<T>(url: string): Promise<T | null> {
	await throttle();
	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			headers: { Accept: "application/json" },
		});
		if (!response.ok) {
			if (response.status === 429) {
				console.warn("[Audible] Rate limited, backing off...");
				await new Promise((r) => setTimeout(r, 5000));
				return null;
			}
			return null;
		}
		return (await response.json()) as T;
	} catch (err) {
		console.warn(`[Audible] Fetch failed for ${url}:`, err);
		return null;
	}
}

function getTld(region: string): string {
	return REGION_TLD_MAP[region] ?? ".com";
}

function parsePosition(pos: string | undefined): number | null {
	if (!pos) return null;
	const num = Number.parseFloat(pos);
	return Number.isFinite(num) ? num : null;
}

function stripHtml(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.trim();
}

async function downloadCover(
	imageUrl: string,
	bookUuid: string,
): Promise<string | null> {
	try {
		await fs.mkdir(COVERS_DIR, { recursive: true });
		const outputPath = path.join(COVERS_DIR, `${bookUuid}.webp`);

		// Check if we already have a cover
		try {
			await fs.access(outputPath);
			return path.relative(process.cwd(), outputPath);
		} catch {
			// doesn't exist yet
		}

		const response = await fetch(imageUrl, {
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (!response.ok) return null;

		const buffer = Buffer.from(await response.arrayBuffer());

		// Use sharp to convert to webp
		const sharp = (await import("sharp")).default;
		await sharp(buffer)
			.resize(800, 800, { fit: "inside", withoutEnlargement: true })
			.webp({ quality: 90, effort: 5 })
			.toFile(outputPath);

		return path.relative(process.cwd(), outputPath);
	} catch (err) {
		console.warn("[Audible] Failed to download cover:", err);
		return null;
	}
}

// ─── Audible Catalog Search ──────────────────────────────

async function searchAudibleCatalog(
	title: string,
	author: string | undefined,
	region: string,
	limit = 10,
): Promise<AudibleCatalogProduct[]> {
	const tld = getTld(region);
	const params = new URLSearchParams({
		num_results: String(limit),
		products_sort_by: "Relevance",
	});
	if (title) params.set("title", title);
	if (author) params.set("author", author);

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
		result.genres = book.genres.map((g) => g.name);
	}

	if (book.rating) {
		const rating = Number.parseFloat(book.rating);
		if (Number.isFinite(rating)) {
			result.audibleRating = rating;
		}
	}

	return result;
}

function mapCatalogProductToMetadata(
	product: AudibleCatalogProduct,
): Partial<AudiobookMetadata> {
	const result: Partial<AudiobookMetadata> = {
		title: product.title || undefined,
		subtitle: product.subtitle || undefined,
		asin: product.asin,
		publishedDate: product.release_date || undefined,
		languageCode: product.language || undefined,
		duration: product.runtime_length_min
			? product.runtime_length_min * 60
			: undefined,
	};

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
	/**
	 * Search Audible catalog by title/author. Returns lightweight results
	 * from the catalog API (no Audnexus enrichment yet).
	 */
	async search(
		input: Partial<AudiobookMetadata>,
		region = "us",
	): Promise<Partial<AudiobookMetadata>[]> {
		const title = input.title;
		if (!title) return [];

		const authorName = input.authors?.[0]?.name;
		const products = await searchAudibleCatalog(title, authorName, region);

		return products.map(mapCatalogProductToMetadata);
	}

	/**
	 * Get full enriched metadata for an audiobook by ASIN via Audnexus.
	 * Downloads cover art and fetches chapter data.
	 */
	async getByAsin(
		asin: string,
		region = "us",
		bookUuid?: string,
	): Promise<Partial<AudiobookMetadata> | null> {
		const book = await getAudnexusBook(asin, region);
		if (!book) return null;

		// Download cover if available
		let coverPath: string | null = null;
		if (book.image && bookUuid) {
			coverPath = await downloadCover(book.image, bookUuid);
		}

		return mapAudnexusToMetadata(book, coverPath);
	}

	/**
	 * Get chapter data for an audiobook by ASIN.
	 */
	async getChapters(asin: string, region = "us") {
		return getAudnexusChapters(asin, region);
	}
}

export const audibleProvider = new AudibleProvider();
