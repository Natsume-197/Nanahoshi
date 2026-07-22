import { logger } from "../../../../lib/logger";
import { getGoodreadsConfig } from "../../../settings/settings.service";
import type { BookMetadata } from "../book.metadata.model";
import {
	type BookSearchCandidate,
	bookMetadataIdentityEvidence,
	emptyMetadataProviderResult,
	type ISearchableMetadataProvider,
	type MetadataProviderResult,
	metadataProviderResult,
} from "./IMetadata.provider";
import {
	createRequestPacer,
	deriveIsbnPair,
	downloadCoverImage,
	extractIsbnFromText,
	fetchOrTransient,
	ProviderTransientError,
	stripHtml,
} from "./provider.utils";
import {
	cleanSearchTerm,
	isTitleSimilar,
	normalizeForComparison,
	titleSimilarityScore,
} from "./title-match";

const log = logger.child({ component: "goodreads-provider" });

// Public AppSync endpoint + API key used by the Goodreads web app itself
// (visible in its JS bundle / DevTools network tab). Not a private credential.
const GRAPHQL_ENDPOINT =
	"https://kxbwmqov6jgg3daaamb744ycu4.appsync-api.us-east-1.amazonaws.com/graphql";
const GRAPHQL_API_KEY = "da2-xpgsdydkbregjhpr6ejzqdhuwy";
const AUTOCOMPLETE_URL =
	"https://www.goodreads.com/book/auto_complete?format=json&q=";
const ISBN_URL = "https://www.goodreads.com/book/isbn/";
const BOOK_URL = "https://www.goodreads.com/book/show/";
const BOOK_PATH_PATTERN = /^\/book\/show\/(\d+)/;
const SEARCH_RESULT_LIMIT = 8;

const GRAPHQL_QUERY = `query getBookPageData($legacyBookId: Int!) {
	getBookByLegacyId(legacyId: $legacyBookId) {
		title
		description
		imageUrl
		primaryContributorEdge { node { name } }
		secondaryContributorEdges { node { name } }
		bookSeries { userPosition series { title } }
		bookGenres { genre { name } }
		details {
			numPages
			publicationTime
			publisher
			isbn
			isbn13
			language { name }
		}
	}
}`;

const pace = createRequestPacer(1200);

type AutocompleteEntry = {
	bookId?: string;
	title?: string;
	bookTitleBare?: string;
	author?: { name?: string };
	imageUrl?: string;
	bookUrl?: string;
};

type GraphqlBook = {
	title?: string;
	description?: string;
	imageUrl?: string;
	primaryContributorEdge?: { node?: { name?: string } };
	secondaryContributorEdges?: { node?: { name?: string } }[];
	bookSeries?: { userPosition?: string; series?: { title?: string } }[];
	bookGenres?: { genre?: { name?: string } }[];
	details?: {
		numPages?: number;
		publicationTime?: number;
		publisher?: string;
		isbn?: string;
		isbn13?: string;
		language?: { name?: string };
	};
};

const LANGUAGE_CODES: Record<string, string> = {
	english: "en",
	japanese: "ja",
	spanish: "es",
	french: "fr",
	german: "de",
	italian: "it",
	portuguese: "pt",
	chinese: "zh",
	korean: "ko",
	russian: "ru",
};

class GoodreadsProvider implements ISearchableMetadataProvider {
	async isAvailable(serverId: string | null | undefined): Promise<boolean> {
		if (!serverId) return true;
		return (await getGoodreadsConfig(serverId)).enabled;
	}

	async getMetadata(
		input: Partial<BookMetadata> & {
			bookId?: number;
			uuid?: string;
			serverId?: string | null;
		},
	): Promise<MetadataProviderResult> {
		try {
			if (input.serverId) {
				const config = await getGoodreadsConfig(input.serverId);
				if (!config.enabled) return emptyMetadataProviderResult();
			}

			let legacyId: string | null = null;
			const isbn = (input.isbn13 ?? input.isbn10)?.replace(/-/g, "");
			if (isbn) legacyId = await this.resolveIsbn(isbn);

			if (!legacyId && input.title) {
				const entries = await this.autocomplete(input.title);
				const best = this.rankEntries(entries, input.title)[0];
				// Only trust a title match — autocomplete happily returns unrelated
				// popular books for queries it can't resolve.
				if (
					best?.bookId &&
					this.entryTitle(best) &&
					isTitleSimilar(
						normalizeForComparison(cleanSearchTerm(input.title)),
						normalizeForComparison(this.entryTitle(best) ?? ""),
					)
				) {
					legacyId = best.bookId;
				}
			}
			if (!legacyId) return emptyMetadataProviderResult();

			const metadata = await this.fetchByLegacyId(legacyId);
			if (!metadata) return emptyMetadataProviderResult();
			const identityEvidence = bookMetadataIdentityEvidence(metadata);

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
			return metadataProviderResult(metadata, identityEvidence);
		} catch (error) {
			if (error instanceof ProviderTransientError) throw error;
			log.warn({ err: error }, "Error fetching metadata");
			return emptyMetadataProviderResult();
		}
	}

	async search(
		input: { title?: string; author?: string },
		options?: { serverId?: string | null },
	): Promise<BookSearchCandidate[]> {
		try {
			if (options?.serverId) {
				const config = await getGoodreadsConfig(options.serverId);
				if (!config.enabled) return [];
			}

			const title = input.title?.trim();
			if (!title) return [];

			// A pasted ISBN resolves to the exact edition first.
			const isbn = extractIsbnFromText(title);
			if (isbn) {
				const legacyId = await this.resolveIsbn(isbn);
				if (legacyId) {
					const metadata = await this.fetchByLegacyId(legacyId);
					if (metadata?.title) {
						return [
							{
								provider: "goodreads",
								providerId: legacyId,
								title: metadata.title,
								authors: metadata.authors?.map((a) => ({ name: a.name })),
								series: metadata.series ?? null,
								publishedDate: metadata.publishedDate ?? null,
								previewCover: metadata.cover ?? null,
								url: `${BOOK_URL}${legacyId}`,
							},
						];
					}
				}
			}

			const entries = await this.autocomplete(title);
			return this.rankEntries(entries, title)
				.slice(0, SEARCH_RESULT_LIMIT)
				.flatMap((entry) => {
					const candidate = this.toCandidate(entry);
					return candidate ? [candidate] : [];
				});
		} catch (error) {
			if (error instanceof ProviderTransientError) throw error;
			log.warn({ err: error }, "Search failed");
			return [];
		}
	}

	async getById(
		providerId: string,
		options?: {
			serverId?: string | null;
			uuid?: string;
			keepRemoteCover?: boolean;
		},
	): Promise<Partial<BookMetadata> | null> {
		try {
			const metadata = await this.fetchByLegacyId(providerId);
			if (!metadata) return null;

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
			if (error instanceof ProviderTransientError) throw error;
			log.warn({ err: error, providerId }, "getById failed");
			return null;
		}
	}

	// ─── Goodreads endpoints ─────────────────────────────

	private async pacedFetch(url: string, init?: RequestInit): Promise<Response> {
		await pace();
		return fetchOrTransient("Goodreads", url, init);
	}

	// The /book/isbn/<isbn> page redirects to /book/show/<legacyId>-slug.
	private async resolveIsbn(isbn: string): Promise<string | null> {
		const response = await this.pacedFetch(`${ISBN_URL}${isbn}`, {
			method: "HEAD",
			redirect: "follow",
		});
		const match = new URL(response.url).pathname.match(BOOK_PATH_PATTERN);
		return match?.[1] ?? null;
	}

	private async autocomplete(term: string): Promise<AutocompleteEntry[]> {
		const cleaned = cleanSearchTerm(term);
		if (!cleaned) return [];
		const response = await this.pacedFetch(
			`${AUTOCOMPLETE_URL}${encodeURIComponent(cleaned)}`,
			{ headers: { Accept: "application/json" } },
		);
		if (!response.ok) {
			log.warn({ status: response.status }, "Autocomplete request failed");
			return [];
		}
		const data = (await response.json()) as unknown;
		if (!Array.isArray(data)) return [];
		return (data as AutocompleteEntry[]).filter((entry) => entry?.bookId);
	}

	private async fetchByLegacyId(
		providerId: string,
	): Promise<Partial<BookMetadata> | null> {
		const legacyBookId = Number.parseInt(providerId, 10);
		if (!Number.isFinite(legacyBookId)) return null;

		const response = await this.pacedFetch(GRAPHQL_ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": GRAPHQL_API_KEY,
			},
			body: JSON.stringify({
				operationName: "getBookPageData",
				variables: { legacyBookId },
				query: GRAPHQL_QUERY,
			}),
		});
		if (!response.ok) {
			log.warn({ status: response.status }, "GraphQL request failed");
			return null;
		}
		const payload = (await response.json()) as {
			errors?: unknown[];
			data?: { getBookByLegacyId?: GraphqlBook | null };
		};
		if (payload.errors?.length) {
			log.warn({ errors: payload.errors }, "GraphQL returned errors");
			return null;
		}
		const book = payload.data?.getBookByLegacyId;
		if (!book?.title) return null;
		return this.mapBook(book);
	}

	// ─── Mapping ─────────────────────────────────────────

	private mapBook(book: GraphqlBook): Partial<BookMetadata> {
		const authors: { name: string; role: string }[] = [];
		const primary = book.primaryContributorEdge?.node?.name;
		if (primary) authors.push({ name: primary, role: "Author" });
		for (const edge of book.secondaryContributorEdges ?? []) {
			if (edge.node?.name)
				authors.push({ name: edge.node.name, role: "Author" });
		}

		const firstSeries = book.bookSeries?.[0];
		const seriesName = firstSeries?.series?.title?.trim();
		const seriesPosition = Number.parseFloat(firstSeries?.userPosition ?? "");

		const genres = (book.bookGenres ?? [])
			.map((entry) => entry.genre?.name?.trim())
			.filter((name): name is string => Boolean(name));

		const details = book.details;
		const publishedDate = details?.publicationTime
			? new Date(details.publicationTime).toISOString().slice(0, 10)
			: null;
		const languageCode = details?.language?.name
			? (LANGUAGE_CODES[details.language.name.toLowerCase()] ?? null)
			: null;

		return deriveIsbnPair({
			...(book.title && { title: book.title.trim() }),
			...(book.description && { description: stripHtml(book.description) }),
			...(publishedDate && { publishedDate }),
			...(languageCode && { languageCode }),
			...(details?.numPages &&
				details.numPages > 0 && { pageCount: details.numPages }),
			...(details?.isbn && { isbn10: details.isbn }),
			...(details?.isbn13 && { isbn13: details.isbn13 }),
			...(authors.length > 0 && { authors }),
			...(details?.publisher && {
				publisher: { name: details.publisher.trim() },
			}),
			...(seriesName && {
				series: {
					name: seriesName,
					position: Number.isNaN(seriesPosition) ? null : seriesPosition,
				},
			}),
			...(genres.length > 0 && { genres }),
			cover: book.imageUrl ?? null,
		});
	}

	private entryTitle(entry: AutocompleteEntry): string | null {
		return entry.bookTitleBare ?? entry.title ?? null;
	}

	private rankEntries(
		entries: AutocompleteEntry[],
		inputTitle: string,
	): AutocompleteEntry[] {
		const normalizedInput = normalizeForComparison(cleanSearchTerm(inputTitle));
		return [...entries].sort((a, b) => {
			const similarity = (entry: AutocompleteEntry) =>
				titleSimilarityScore(
					normalizedInput,
					normalizeForComparison(this.entryTitle(entry) ?? ""),
				);
			return similarity(b) - similarity(a);
		});
	}

	private toCandidate(entry: AutocompleteEntry): BookSearchCandidate | null {
		const title = this.entryTitle(entry);
		if (!entry.bookId || !title) return null;
		return {
			provider: "goodreads",
			providerId: entry.bookId,
			title,
			authors: entry.author?.name ? [{ name: entry.author.name }] : undefined,
			previewCover: entry.imageUrl ?? null,
			url: entry.bookUrl
				? new URL(entry.bookUrl, "https://www.goodreads.com").toString()
				: `${BOOK_URL}${entry.bookId}`,
		};
	}
}

export const goodreadsProvider = new GoodreadsProvider();
