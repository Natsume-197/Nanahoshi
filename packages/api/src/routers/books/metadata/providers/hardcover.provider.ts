import { logger } from "../../../../lib/logger";
import {
	getHardcoverConfig,
	type HardcoverConfig,
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

const log = logger.child({ component: "hardcover-provider" });

const GRAPHQL_ENDPOINT = "https://api.hardcover.app/v1/graphql";
const SEARCH_RESULT_LIMIT = 8;
const MAX_GENRES = 10;

const pace = createRequestPacer(1200);

// Selection shared by the ISBN and by-id lookups; editions carry the
// identifiers/publisher/language, the book carries description/series/tags.
const BOOK_SELECTION = `
	id
	slug
	title
	subtitle
	description
	cached_contributors
	featured_book_series { position series { name } }
	release_date
	pages
	image { url }
	cached_tags
	editions(limit: 10) {
		title
		pages
		release_date
		image { url }
		publisher { name }
		isbn_10
		isbn_13
		language { code2 }
	}
`;

type Contributor = { author?: { name?: string } };

type Edition = {
	title?: string;
	pages?: number;
	release_date?: string;
	image?: { url?: string };
	publisher?: { name?: string };
	isbn_10?: string;
	isbn_13?: string;
	language?: { code2?: string };
};

type HardcoverBook = {
	id?: number;
	slug?: string;
	title?: string;
	subtitle?: string;
	description?: string;
	cached_contributors?: Contributor[];
	featured_book_series?: { position?: number; series?: { name?: string } };
	release_date?: string;
	pages?: number;
	image?: { url?: string };
	cached_tags?: Record<string, { tag?: string }[] | undefined>;
	editions?: Edition[];
};

type SearchDocument = {
	id?: string;
	title?: string;
	subtitle?: string;
	description?: string;
	author_names?: string[];
	featured_series?: { position?: number; series?: { name?: string } };
	release_date?: string;
	pages?: number;
	image?: { url?: string };
	isbns?: string[];
	slug?: string;
};

class HardcoverProvider implements ISearchableMetadataProvider {
	async getMetadata(
		input: Partial<BookMetadata> & {
			bookId?: number;
			uuid?: string;
			serverId?: string | null;
		},
	): Promise<Partial<BookMetadata>> {
		try {
			const config = await this.getConfig(input.serverId);
			if (!config.enabled || !config.apiToken) return {};

			let book: HardcoverBook | null = null;
			const isbn = (input.isbn13 ?? input.isbn10)?.replace(/-/g, "");
			if (isbn) book = await this.fetchByIsbn(isbn, config);

			if (!book && input.title) {
				const documents = await this.searchDocuments(
					input.title,
					input.authors?.[0]?.name,
					config,
				);
				const best = this.rankDocuments(documents, input.title)[0];
				if (best?.id) book = await this.fetchByBookId(best.id, config);
			}
			if (!book) return {};

			const metadata = this.mapBook(book);
			// Enrichment fills gaps; the existing title always wins.
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
			if (!config.enabled || !config.apiToken) return [];

			const title = input.title?.trim();
			if (!title) return [];

			// A pasted ISBN resolves to the exact book first.
			const isbn = extractIsbnFromText(title);
			if (isbn) {
				const book = await this.fetchByIsbn(isbn, config);
				const candidate = book ? this.bookToCandidate(book) : null;
				if (candidate) return [candidate];
			}

			const documents = await this.searchDocuments(title, input.author, config);
			return this.rankDocuments(documents, title)
				.slice(0, SEARCH_RESULT_LIMIT)
				.flatMap((document) => {
					const candidate = this.documentToCandidate(document);
					return candidate ? [candidate] : [];
				});
		} catch (error) {
			log.warn({ err: error }, "Search failed");
			return [];
		}
	}

	// providerId is the numeric Hardcover book id.
	async getById(
		providerId: string,
		options?: {
			serverId?: string | null;
			uuid?: string;
			keepRemoteCover?: boolean;
		},
	): Promise<Partial<BookMetadata> | null> {
		try {
			const config = await this.getConfig(options?.serverId);
			if (!config.enabled || !config.apiToken) return null;

			const bookId = Number.parseInt(providerId, 10);
			if (!Number.isFinite(bookId)) return null;

			const book = await this.fetchByBookId(String(bookId), config);
			if (!book) return null;

			const metadata = this.mapBook(book);
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
			log.warn({ err: error, providerId }, "getById failed");
			return null;
		}
	}

	// ─── Hardcover GraphQL ───────────────────────────────

	private async executeQuery<T>(
		query: string,
		variables: Record<string, unknown>,
		config: HardcoverConfig,
	): Promise<T | null> {
		await pace();
		const response = await fetch(GRAPHQL_ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${config.apiToken}`,
			},
			body: JSON.stringify({ query, variables }),
		});
		if (!response.ok) {
			log.warn({ status: response.status }, "Hardcover request failed");
			return null;
		}
		const payload = (await response.json()) as {
			errors?: unknown[];
			data?: T;
		};
		if (payload.errors?.length) {
			log.warn({ errors: payload.errors }, "Hardcover GraphQL errors");
			return null;
		}
		return payload.data ?? null;
	}

	private async fetchByIsbn(
		isbn: string,
		config: HardcoverConfig,
	): Promise<HardcoverBook | null> {
		const data = await this.executeQuery<{ books?: HardcoverBook[] }>(
			`query BookByIsbn($isbn: String!) {
				books(where: {editions: {_or: [{isbn_13: {_eq: $isbn}}, {isbn_10: {_eq: $isbn}}]}}, limit: 1) {
					${BOOK_SELECTION}
				}
			}`,
			{ isbn },
			config,
		);
		return data?.books?.[0] ?? null;
	}

	private async fetchByBookId(
		bookId: string,
		config: HardcoverConfig,
	): Promise<HardcoverBook | null> {
		const data = await this.executeQuery<{ books_by_pk?: HardcoverBook }>(
			`query BookById($id: Int!) {
				books_by_pk(id: $id) {
					${BOOK_SELECTION}
				}
			}`,
			{ id: Number.parseInt(bookId, 10) },
			config,
		);
		return data?.books_by_pk ?? null;
	}

	private async searchDocuments(
		title: string,
		author: string | undefined,
		config: HardcoverConfig,
	): Promise<SearchDocument[]> {
		const query = [cleanSearchTerm(title), author?.trim()]
			.filter(Boolean)
			.join(" ");
		if (!query) return [];

		const data = await this.executeQuery<{
			search?: { results?: unknown };
		}>(
			`query BookSearch($q: String!, $limit: Int!) {
				search(query: $q, query_type: "Book", per_page: $limit, page: 1) { results }
			}`,
			{ q: query, limit: 10 },
			config,
		);

		// results is an opaque JSON blob (Typesense response) with hits[].document.
		const results = data?.search?.results as
			| { hits?: { document?: SearchDocument }[] }
			| undefined;
		return (results?.hits ?? [])
			.map((hit) => hit.document)
			.filter((document): document is SearchDocument =>
				Boolean(document?.id && document.title),
			);
	}

	// ─── Mapping ─────────────────────────────────────────

	private mapBook(book: HardcoverBook): Partial<BookMetadata> {
		// Prefer the edition with identifiers; the base book fills the rest.
		const edition = [...(book.editions ?? [])].sort(
			(a, b) => this.editionScore(b) - this.editionScore(a),
		)[0];

		const authors = (book.cached_contributors ?? [])
			.map((contributor) => contributor.author?.name?.trim())
			.filter((name): name is string => Boolean(name))
			.map((name) => ({ name, role: "Author" }));

		const seriesName = book.featured_book_series?.series?.name?.trim();
		const seriesPosition = book.featured_book_series?.position;

		const genres = this.cachedTagNames(book.cached_tags, "Genre").slice(
			0,
			MAX_GENRES,
		);
		const tags = this.cachedTagNames(book.cached_tags, "Tag").slice(
			0,
			MAX_GENRES,
		);

		const publishedDate = normalizePublishedDate(
			edition?.release_date ?? book.release_date,
		);
		const pageCount = edition?.pages ?? book.pages;
		const cover = edition?.image?.url ?? book.image?.url ?? null;

		return deriveIsbnPair({
			...(book.title && { title: book.title.trim() }),
			...(book.subtitle && { subtitle: book.subtitle.trim() }),
			...(book.description && { description: stripHtml(book.description) }),
			...(publishedDate && { publishedDate }),
			...(edition?.language?.code2 && { languageCode: edition.language.code2 }),
			...(pageCount && pageCount > 0 && { pageCount }),
			...(edition?.isbn_10 && { isbn10: edition.isbn_10 }),
			...(edition?.isbn_13 && { isbn13: edition.isbn_13 }),
			...(authors.length > 0 && { authors }),
			...(edition?.publisher?.name && {
				publisher: { name: edition.publisher.name },
			}),
			...(seriesName && {
				series: { name: seriesName, position: seriesPosition ?? null },
			}),
			...(genres.length > 0 && { genres }),
			...(tags.length > 0 && { tags }),
			cover,
		});
	}

	private editionScore(edition: Edition): number {
		let score = 0;
		if (edition.isbn_13) score += 4;
		if (edition.isbn_10) score += 2;
		if (edition.publisher?.name) score += 2;
		if (edition.language?.code2) score += 1;
		if (edition.image?.url) score += 1;
		if (edition.pages) score += 1;
		return score;
	}

	// cached_tags: { "Genre": [{tag: "Fantasy", ...}], "Mood": [...], ... }
	private cachedTagNames(
		cachedTags: HardcoverBook["cached_tags"],
		category: string,
	): string[] {
		const entries = cachedTags?.[category];
		if (!Array.isArray(entries)) return [];
		const names = entries
			.map((entry) => entry?.tag?.trim())
			.filter((tag): tag is string => Boolean(tag));
		return [...new Set(names)];
	}

	private rankDocuments(
		documents: SearchDocument[],
		inputTitle: string,
	): SearchDocument[] {
		const normalizedInput = normalizeForComparison(cleanSearchTerm(inputTitle));
		return [...documents].sort((a, b) => {
			const similarity = (document: SearchDocument) =>
				titleSimilarityScore(
					normalizedInput,
					normalizeForComparison(document.title ?? ""),
				);
			return similarity(b) - similarity(a);
		});
	}

	private documentToCandidate(
		document: SearchDocument,
	): BookSearchCandidate | null {
		if (!document.id || !document.title) return null;
		const seriesName = document.featured_series?.series?.name;
		return {
			provider: "hardcover",
			providerId: document.id,
			title: document.title,
			authors: document.author_names?.map((name) => ({ name })),
			series: seriesName
				? {
						name: seriesName,
						position: document.featured_series?.position ?? null,
					}
				: null,
			publishedDate: normalizePublishedDate(document.release_date),
			previewCover: document.image?.url ?? null,
			url: document.slug
				? `https://hardcover.app/books/${document.slug}`
				: null,
		};
	}

	private bookToCandidate(book: HardcoverBook): BookSearchCandidate | null {
		if (!book.id || !book.title) return null;
		const seriesName = book.featured_book_series?.series?.name;
		return {
			provider: "hardcover",
			providerId: String(book.id),
			title: book.title,
			authors: (book.cached_contributors ?? [])
				.map((contributor) => contributor.author?.name)
				.filter((name): name is string => Boolean(name))
				.map((name) => ({ name })),
			series: seriesName
				? {
						name: seriesName,
						position: book.featured_book_series?.position ?? null,
					}
				: null,
			publishedDate: normalizePublishedDate(book.release_date),
			previewCover: book.image?.url ?? null,
			url: book.slug ? `https://hardcover.app/books/${book.slug}` : null,
		};
	}

	private async getConfig(
		serverId: string | null | undefined,
	): Promise<HardcoverConfig> {
		// No org → no API token stored → provider inactive.
		if (!serverId) return { enabled: false };
		return getHardcoverConfig(serverId);
	}
}

export const hardcoverProvider = new HardcoverProvider();
