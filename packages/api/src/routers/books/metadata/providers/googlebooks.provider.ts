import { logger } from "../../../../lib/logger";
import {
	type GoogleBooksConfig,
	getGoogleBooksConfig,
} from "../../../settings/settings.service";
import type { BookMetadata } from "../book.metadata.model";
import type {
	BookSearchCandidate,
	ISearchableMetadataProvider,
} from "./IMetadata.provider";
import {
	createRequestPacer,
	deriveIsbnPair,
	downloadCoverImage,
	extractIsbnFromText,
	normalizePublishedDate,
	stripHtml,
} from "./provider.utils";
import {
	cleanSearchTerm,
	normalizeForComparison,
	titleSimilarityScore,
} from "./title-match";

const log = logger.child({ component: "googlebooks-provider" });

const API_BASE = "https://www.googleapis.com/books/v1/volumes";
const MAX_SEARCH_TERM_LENGTH = 60;
const SEARCH_RESULT_LIMIT = 8;

const pace = createRequestPacer(1500);

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
	async getMetadata(
		input: Partial<BookMetadata> & {
			bookId?: number;
			uuid?: string;
			serverId?: string | null;
		},
	): Promise<Partial<BookMetadata>> {
		try {
			const config = await this.getConfig(input.serverId);
			if (!config.enabled) return {};

			const volume = await this.findBestVolume(input, config);
			if (!volume) return {};

			const metadata = this.mapVolume(volume);
			// Enrichment fills gaps; the local/RanobeDB title always wins.
			metadata.title = undefined;

			if (metadata.cover && !input.cover && input.uuid) {
				const localCoverPath = await downloadCoverImage(
					metadata.cover,
					input.uuid,
				);
				metadata.cover = localCoverPath ?? undefined;
			} else {
				metadata.cover = undefined;
			}

			return metadata;
		} catch (error) {
			log.warn({ err: error }, "Error fetching metadata");
			return {};
		}
	}

	async search(
		input: { title?: string; author?: string },
		options?: { serverId?: string | null },
	): Promise<BookSearchCandidate[]> {
		try {
			const config = await this.getConfig(options?.serverId);
			if (!config.enabled) return [];

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
			log.warn({ err: error }, "Search failed");
			return [];
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
			if (!config.enabled) return null;

			// The single-volume endpoint returns printedPageCount/seriesInfo more
			// reliably than search results.
			const url = new URL(`${API_BASE}/${encodeURIComponent(volumeId)}`);
			if (config.apiKey) url.searchParams.set("key", config.apiKey);
			const volume = await this.fetchJson<Volume>(url);
			if (!volume?.volumeInfo?.title) return null;

			const metadata = this.mapVolume(volume);
			if (metadata.cover && options?.uuid) {
				const localCoverPath = await downloadCoverImage(
					metadata.cover,
					options.uuid,
				);
				metadata.cover = localCoverPath ?? undefined;
			} else if (!options?.keepRemoteCover) {
				metadata.cover = undefined;
			}
			return metadata;
		} catch (error) {
			log.warn({ err: error, volumeId }, "getById failed");
			return null;
		}
	}

	// ─── Search internals ────────────────────────────────

	private async findBestVolume(
		input: Partial<BookMetadata>,
		config: GoogleBooksConfig,
	): Promise<Volume | null> {
		const isbn = (input.isbn13 ?? input.isbn10)?.replace(/-/g, "");
		if (isbn) {
			let volumes = await this.queryVolumes(`isbn:${isbn}`, 5, config);
			if (volumes.length === 0) {
				// Broader fallback: some volumes only index the ISBN as plain text.
				volumes = await this.queryVolumes(isbn, 5, config);
			}
			const best = this.rankVolumes(volumes, input.title ?? undefined)[0];
			if (best) return best;
		}

		const title = input.title?.trim();
		if (!title) return null;
		const author = input.authors?.[0]?.name;

		for (const query of this.buildTermQueries(title, author)) {
			const volumes = await this.queryVolumes(query, 20, config);
			const best = this.rankVolumes(volumes, title)[0];
			if (best) return best;
		}
		return null;
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
		config: GoogleBooksConfig,
	): Promise<Volume[]> {
		const url = new URL(API_BASE);
		url.searchParams.set("q", query);
		url.searchParams.set("maxResults", String(maxResults));
		if (config.langRestrict) {
			url.searchParams.set("langRestrict", config.langRestrict);
		}
		if (config.apiKey) url.searchParams.set("key", config.apiKey);

		const data = await this.fetchJson<{ items?: Volume[] }>(url);
		return (data?.items ?? []).filter((volume) => this.isRelevant(volume));
	}

	private async fetchJson<T>(url: URL): Promise<T | null> {
		await pace();
		const response = await fetch(url, {
			headers: { Accept: "application/json" },
		});
		if (response.status === 429) {
			log.warn("Google Books API rate limit exceeded");
			return null;
		}
		if (!response.ok) {
			log.warn({ status: response.status }, "Google Books API request failed");
			return null;
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
	): Promise<GoogleBooksConfig> {
		// Library-less books have no organization → default to enabled.
		if (!serverId) return { enabled: true };
		return getGoogleBooksConfig(serverId);
	}
}

export const googlebooksProvider = new GoogleBooksProvider();
