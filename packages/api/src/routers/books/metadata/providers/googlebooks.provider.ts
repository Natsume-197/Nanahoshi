import sharp from "sharp";
import { providerGate } from "../../../../infrastructure/providerGate";
import { providerQuotaScope } from "../../../../infrastructure/providerQuotaScope";
import { logger } from "../../../../lib/logger";
import {
	type GoogleBooksConfig,
	getGoogleBooksConfig,
} from "../../../settings/settings.service";
import type { BookMetadata } from "../book.metadata.model";
import {
	type BookSearchCandidate,
	bookMetadataIdentityEvidence,
	type ISearchableMetadataProvider,
	type MetadataProviderResult,
	type ProviderCandidate,
} from "./IMetadata.provider";
import {
	CANDIDATE_LIMIT,
	deriveIsbnPair,
	downloadCoverImage,
	extractIsbnFromText,
	fetchOrTransient,
	hydratedProviderResult,
	normalizePublishedDate,
	ProviderCredentialError,
	ProviderResponseError,
	ProviderTransientError,
	stripHtml,
} from "./provider.utils";
import {
	cleanSearchTerm,
	normalizeForComparison,
	titleSimilarityScore,
} from "./title-match";

const log = logger.child({ component: "googlebooks-provider" });

/**
 * Google answers a missing zoom level with a near-white "image not available"
 * card (575x750 at zoom=0, 300x391 at zoom=2) instead of an error. Real covers
 * are photos; an almost blank, low-entropy image is the card.
 */
export async function isBlankNoImageCard(
	buffer: Buffer,
	options: { requirePng: boolean } = { requirePng: true },
): Promise<boolean> {
	try {
		const image = sharp(buffer);
		const [metadata, stats] = await Promise.all([
			image.metadata(),
			image.stats(),
		]);
		if (options.requirePng && metadata.format !== "png") return false;
		const mean =
			stats.channels.reduce((sum, channel) => sum + channel.mean, 0) /
			stats.channels.length;
		return mean >= 245 && stats.entropy < 1.5;
	} catch {
		return false;
	}
}

/** Google serves the card as PNG; its real covers are JPEG. */
export function isGoogleBooksPlaceholder(buffer: Buffer): Promise<boolean> {
	return isBlankNoImageCard(buffer);
}

/**
 * zoom=0 is the full-resolution scan when Google has one; volumes without a
 * digitized preview only have the zoom=1 thumbnail. Try the best first.
 */
export function googleCoverCandidates(imageUrl: string): string[] {
	try {
		const url = new URL(imageUrl);
		if (
			url.hostname !== "books.google.com" ||
			url.pathname !== "/books/content" ||
			url.searchParams.get("zoom") === "1"
		) {
			return [imageUrl];
		}
		url.searchParams.set("zoom", "1");
		return [imageUrl, url.toString()];
	} catch {
		return [imageUrl];
	}
}

export async function downloadGoogleBooksCover(
	imageUrl: string,
	uuid: string,
	download: typeof downloadCoverImage = downloadCoverImage,
): Promise<string | null> {
	const accept = async (buffer: Buffer) =>
		!(await isGoogleBooksPlaceholder(buffer));
	for (const candidate of googleCoverCandidates(imageUrl)) {
		const path = await download(candidate, uuid, { accept });
		if (path) return path;
	}
	return null;
}

const API_BASE = "https://www.googleapis.com/books/v1/volumes";
const MAX_SEARCH_TERM_LENGTH = 60;
const SEARCH_RESULT_LIMIT = 8;

const REQUEST_INTERVAL_MS = process.env.NODE_ENV === "test" ? 0 : 1500;

type ScopedGoogleBooksConfig = GoogleBooksConfig & { quotaScope: string };

type ImageLinks = Partial<
	Record<
		| "extraLarge"
		| "large"
		| "medium"
		| "small"
		| "thumbnail"
		| "smallThumbnail",
		string
	>
>;

type VolumeInfo = {
	title?: string;
	subtitle?: string;
	authors?: string[];
	publisher?: string;
	publishedDate?: string;
	description?: string;
	industryIdentifiers?: { type: string; identifier: string }[];
	pageCount?: number;
	printedPageCount?: number;
	categories?: string[];
	language?: string;
	averageRating?: number;
	ratingsCount?: number;
	imageLinks?: ImageLinks;
	canonicalVolumeLink?: string;
	infoLink?: string;
	seriesInfo?: {
		shortSeriesBookTitle?: string;
		bookDisplayNumber?: string;
		volumeSeries?: { orderNumber?: number }[];
	};
};

type Volume = { id?: string; volumeInfo?: VolumeInfo };

class GoogleBooksProvider implements ISearchableMetadataProvider {
	async quotaScope(serverId: string | null | undefined) {
		return (await this.getConfig(serverId)).quotaScope;
	}

	async readiness(serverId: string | null | undefined) {
		const config = await this.getConfig(serverId);
		return !config.enabled
			? ("disabled" as const)
			: config.apiKey
				? ("ready" as const)
				: ("missing_credentials" as const);
	}

	async isAvailable(serverId: string | null | undefined): Promise<boolean> {
		const config = await this.getConfig(serverId);
		return config.enabled && Boolean(config.apiKey);
	}

	async discoverCandidates(
		input: Partial<BookMetadata> & { serverId?: string | null },
	): Promise<ProviderCandidate[]> {
		const config = await this.getConfig(input.serverId);
		if (!config.enabled || !config.apiKey) return [];

		return (await this.findVolumes(input, config))
			.slice(0, CANDIDATE_LIMIT)
			.flatMap((volume) => {
				if (!volume.id) return [];
				const metadata = this.mapVolume(volume);
				return [
					{
						providerId: volume.id,
						identity: bookMetadataIdentityEvidence(metadata),
						metadata,
					},
				];
			});
	}

	// The search response already carries volumeInfo, so hydration costs nothing
	// beyond the shared tail.
	async hydrateCandidate(
		candidate: ProviderCandidate,
		input: Partial<BookMetadata> & { uuid?: string },
	): Promise<MetadataProviderResult | null> {
		if (!candidate.metadata) return null;
		return await hydratedProviderResult(
			candidate.metadata,
			input,
			candidate.identity,
			downloadGoogleBooksCover,
		);
	}

	async search(
		input: { title?: string; author?: string },
		options?: { serverId?: string | null },
	): Promise<BookSearchCandidate[]> {
		try {
			const config = await this.getConfig(options?.serverId);
			if (!config.enabled || !config.apiKey) return [];

			const title = input.title?.trim();
			if (!title) return [];

			// A pasted ISBN resolves directly.
			const isbn = extractIsbnFromText(title);
			let volumes = isbn
				? await this.queryVolumes(`isbn:${isbn}`, 5, config)
				: [];
			if (volumes.length === 0) {
				for (const query of this.buildTermQueries(title, input.author)) {
					volumes = await this.queryVolumes(query, 20, config);
					if (volumes.length > 0) break;
				}
			}

			return this.rankVolumes(volumes, title)
				.slice(0, SEARCH_RESULT_LIMIT)
				.flatMap((volume) => {
					const candidate = this.toCandidate(volume);
					return candidate ? [candidate] : [];
				});
		} catch (error) {
			if (
				error instanceof ProviderTransientError ||
				error instanceof ProviderCredentialError ||
				error instanceof ProviderResponseError
			)
				throw error;
			log.warn({ err: error }, "Search failed");
			throw new ProviderResponseError("Google Books", "search failed", {
				cause: error,
			});
		}
	}

	async getById(
		volumeId: string,
		options?: {
			serverId?: string | null;
			uuid?: string;
			keepRemoteCover?: boolean;
		},
	): Promise<Partial<BookMetadata> | null> {
		try {
			const config = await this.getConfig(options?.serverId);
			if (!config.enabled || !config.apiKey) return null;

			// The single-volume endpoint returns printedPageCount/seriesInfo more
			// reliably than search results.
			const url = new URL(`${API_BASE}/${encodeURIComponent(volumeId)}`);
			if (config.apiKey) url.searchParams.set("key", config.apiKey);
			const volume = await this.fetchJson<Volume>(url, config.quotaScope);
			if (!volume?.volumeInfo?.title) return null;

			const metadata = this.mapVolume(volume);
			if (metadata.cover && options?.uuid) {
				const localCoverPath = await downloadGoogleBooksCover(
					metadata.cover,
					options.uuid,
				);
				metadata.cover = localCoverPath ?? undefined;
			} else if (!options?.keepRemoteCover) {
				metadata.cover = undefined;
			}
			return metadata;
		} catch (error) {
			if (
				error instanceof ProviderTransientError ||
				error instanceof ProviderCredentialError ||
				error instanceof ProviderResponseError
			)
				throw error;
			log.warn({ err: error, volumeId }, "getById failed");
			throw new ProviderResponseError("Google Books", "lookup failed", {
				cause: error,
			});
		}
	}

	// ─── Search internals ────────────────────────────────

	/**
	 * The query cascade, ranked. Each query shape is more approximate than the
	 * last, so the first one that finds anything owns the result.
	 */
	private async findVolumes(
		input: Partial<BookMetadata>,
		config: ScopedGoogleBooksConfig,
	): Promise<Volume[]> {
		const isbn = (input.isbn13 ?? input.isbn10)?.replace(/-/g, "");
		if (isbn) {
			let volumes = await this.queryVolumes(`isbn:${isbn}`, 5, config);
			if (volumes.length === 0) {
				// Broader fallback: some volumes only index the ISBN as plain text.
				volumes = await this.queryVolumes(isbn, 5, config);
			}
			const ranked = this.rankVolumes(volumes, input.title ?? undefined);
			if (ranked.length > 0) return ranked;
		}

		const title = input.title?.trim();
		if (!title) return [];
		const author = input.authors?.[0]?.name;

		for (const query of this.buildTermQueries(title, author)) {
			const ranked = this.rankVolumes(
				await this.queryVolumes(query, 20, config),
				title,
			);
			if (ranked.length > 0) return ranked;
		}
		return [];
	}

	private buildTermQueries(title: string, author?: string): string[] {
		const cleaned = this.truncateTerm(cleanSearchTerm(title));
		if (!cleaned) return [];
		const queries: string[] = [];
		if (author?.trim()) {
			queries.push(`intitle:${cleaned} inauthor:${author.trim()}`);
		}
		queries.push(`intitle:${cleaned}`);
		return queries;
	}

	private truncateTerm(term: string): string {
		if (term.length <= MAX_SEARCH_TERM_LENGTH) return term;
		const words = term.split(/\s+/);
		let out = "";
		for (const word of words) {
			if (out.length + word.length + 1 > MAX_SEARCH_TERM_LENGTH) break;
			out = out ? `${out} ${word}` : word;
		}
		return out || term.slice(0, MAX_SEARCH_TERM_LENGTH);
	}

	private async queryVolumes(
		query: string,
		maxResults: number,
		config: ScopedGoogleBooksConfig,
	): Promise<Volume[]> {
		const url = new URL(API_BASE);
		url.searchParams.set("q", query);
		url.searchParams.set("maxResults", String(maxResults));
		if (config.langRestrict) {
			url.searchParams.set("langRestrict", config.langRestrict);
		}
		if (config.apiKey) url.searchParams.set("key", config.apiKey);

		const data = await this.fetchJson<{ items?: Volume[] }>(
			url,
			config.quotaScope,
		);
		return (data?.items ?? []).filter((volume) => this.isRelevant(volume));
	}

	private async fetchJson<T>(url: URL, quotaScope?: string): Promise<T | null> {
		await providerGate.waitForSlot(
			"googlebooks",
			quotaScope ?? "org:instance",
			REQUEST_INTERVAL_MS,
		);
		const response = await fetchOrTransient("Google Books", url, {
			headers: { Accept: "application/json" },
		});
		if (!response.ok) {
			log.warn({ status: response.status }, "Google Books API request failed");
			if (response.status === 404) return null;
			throw new ProviderResponseError(
				"Google Books",
				`HTTP ${response.status}`,
			);
		}
		return (await response.json()) as T;
	}

	// Title of >=2 chars plus at least one identifying field, so garbage
	// volumes don't pollute the fill-in merge.
	private isRelevant(volume: Volume): boolean {
		const info = volume.volumeInfo;
		if (!info?.title || info.title.trim().length < 2) return false;
		return Boolean(
			info.authors?.length ||
				info.industryIdentifiers?.length ||
				(info.description && info.description.length > 10) ||
				info.publisher,
		);
	}

	private rankVolumes(volumes: Volume[], inputTitle?: string): Volume[] {
		const normalizedInput = inputTitle
			? normalizeForComparison(cleanSearchTerm(inputTitle))
			: null;
		return [...volumes].sort((a, b) => {
			if (normalizedInput) {
				const similarity = (volume: Volume) =>
					titleSimilarityScore(
						normalizedInput,
						normalizeForComparison(volume.volumeInfo?.title ?? ""),
					);
				const diff = similarity(b) - similarity(a);
				if (Math.abs(diff) > 0.05) return diff > 0 ? 1 : -1;
			}
			return this.completeness(b) - this.completeness(a);
		});
	}

	private completeness(volume: Volume): number {
		const info = volume.volumeInfo;
		if (!info) return 0;
		const fields: unknown[] = [
			info.title,
			info.subtitle,
			info.authors?.length,
			info.publisher,
			info.publishedDate,
			info.description,
			info.industryIdentifiers?.length,
			info.pageCount,
			info.language,
			info.categories?.length,
			info.imageLinks,
			info.seriesInfo,
		];
		return fields.filter(Boolean).length;
	}

	// ─── Mapping ─────────────────────────────────────────

	private mapVolume(volume: Volume): Partial<BookMetadata> {
		const info = volume.volumeInfo ?? {};
		const isbns = this.extractIsbns(info.industryIdentifiers);
		const pageCount =
			info.printedPageCount && info.printedPageCount > 0
				? info.printedPageCount
				: info.pageCount && info.pageCount > 0
					? info.pageCount
					: undefined;
		const series = this.extractSeries(info);
		const genres = this.splitCategories(info.categories);
		const authors = (info.authors ?? [])
			.map((name) => name.trim())
			.filter(Boolean)
			.map((name) => ({ name, role: "Author" }));

		return deriveIsbnPair({
			...(info.title && { title: info.title.replace(/\s+/g, " ").trim() }),
			...(info.subtitle && { subtitle: info.subtitle.trim() }),
			...(info.description && { description: stripHtml(info.description) }),
			...(normalizePublishedDate(info.publishedDate) && {
				publishedDate: normalizePublishedDate(info.publishedDate),
			}),
			...(info.language && { languageCode: info.language }),
			...(pageCount && { pageCount }),
			...(isbns.isbn10 && { isbn10: isbns.isbn10 }),
			...(isbns.isbn13 && { isbn13: isbns.isbn13 }),
			...(authors.length > 0 && { authors }),
			...(info.publisher && { publisher: { name: info.publisher.trim() } }),
			...(series && { series }),
			...(genres.length > 0 && { genres }),
			...(typeof info.averageRating === "number" && {
				rating: info.averageRating,
			}),
			...(typeof info.ratingsCount === "number" && {
				ratingCount: info.ratingsCount,
			}),
			cover: this.pickImageLink(info.imageLinks) ?? null,
		});
	}

	private extractIsbns(identifiers?: { type: string; identifier: string }[]): {
		isbn10?: string;
		isbn13?: string;
	} {
		const result: { isbn10?: string; isbn13?: string } = {};
		for (const id of identifiers ?? []) {
			if (id.type === "ISBN_10" && !result.isbn10)
				result.isbn10 = id.identifier;
			if (id.type === "ISBN_13" && !result.isbn13)
				result.isbn13 = id.identifier;
		}
		return result;
	}

	// Preference: extraLarge > large > medium > small > thumbnail >
	// smallThumbnail; force https, full zoom, no page-curl overlay.
	private pickImageLink(links?: ImageLinks): string | null {
		const url =
			links?.extraLarge ??
			links?.large ??
			links?.medium ??
			links?.small ??
			links?.thumbnail ??
			links?.smallThumbnail;
		if (!url) return null;
		return url
			.replace(/^http:\/\//, "https://")
			.replace(/zoom=\d+/, "zoom=0")
			.replace(/&?edge=curl/, "");
	}

	// Hierarchical categories ("Fiction / Fantasy / General") split into flat
	// genres; the filler "General" level is dropped.
	private splitCategories(categories?: string[]): string[] {
		const out = new Set<string>();
		for (const category of categories ?? []) {
			for (const part of category.split(" / ")) {
				const trimmed = part.trim();
				if (trimmed && trimmed.toLowerCase() !== "general") out.add(trimmed);
			}
		}
		return [...out];
	}

	private extractSeries(
		info: VolumeInfo,
	): { name: string; position: number | null } | null {
		const seriesInfo = info.seriesInfo;
		if (seriesInfo) {
			const name = seriesInfo.shortSeriesBookTitle?.trim();
			const orderNumber = seriesInfo.volumeSeries?.[0]?.orderNumber;
			const displayNumber = Number.parseFloat(
				seriesInfo.bookDisplayNumber ?? "",
			);
			const position =
				orderNumber ?? (Number.isNaN(displayNumber) ? null : displayNumber);
			if (name) return { name, position };
		}

		// Fallback: series markers in the title ("X, Vol. 3" / "X #3" / "X 第3巻").
		const title = info.title;
		if (!title) return null;
		const patterns = [
			/^(.+?)(?:,\s*)?(?:Vol\.?|Volume)\s*(\d+(?:\.\d+)?)/i,
			/^(.+?)\s*#(\d+(?:\.\d+)?)/,
			/^(.+?)\s*第(\d+)巻/,
		];
		for (const pattern of patterns) {
			const match = title.match(pattern);
			if (match?.[1] && match[2]) {
				const position = Number.parseFloat(match[2]);
				return {
					name: match[1].trim(),
					position: Number.isNaN(position) ? null : position,
				};
			}
		}
		return null;
	}

	private toCandidate(volume: Volume): BookSearchCandidate | null {
		const info = volume.volumeInfo;
		if (!volume.id || !info?.title) return null;
		return {
			provider: "googlebooks",
			providerId: volume.id,
			title: info.title,
			authors: info.authors?.map((name) => ({ name })),
			series: this.extractSeries(info),
			publishedDate: normalizePublishedDate(info.publishedDate),
			previewCover: this.pickImageLink(info.imageLinks),
			url: info.canonicalVolumeLink ?? info.infoLink ?? null,
		};
	}

	private async getConfig(
		serverId: string | null | undefined,
	): Promise<ScopedGoogleBooksConfig> {
		if (!serverId) return { enabled: false, quotaScope: "org:instance" };
		const config = await getGoogleBooksConfig(serverId);
		return {
			...config,
			quotaScope: providerQuotaScope("googlebooks", {
				serverId,
				credential: config.apiKey,
			}),
		};
	}
}

export const googlebooksProvider = new GoogleBooksProvider();
