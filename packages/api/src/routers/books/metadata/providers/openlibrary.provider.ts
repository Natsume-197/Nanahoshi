import { logger } from "../../../../lib/logger";
import { getOpenLibraryConfig } from "../../../settings/settings.service";
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
	normalizePublishedDate,
	ProviderTransientError,
	stripHtml,
} from "./provider.utils";
import {
	cleanSearchTerm,
	normalizeForComparison,
	titleSimilarityScore,
} from "./title-match";

const log = logger.child({ component: "openlibrary-provider" });

const BASE = "https://openlibrary.org";
const COVERS = "https://covers.openlibrary.org";
// Open Library etiquette: identify the client on every request.
const USER_AGENT = "Nanahoshi/2.0 (self-hosted library; metadata enrichment)";
const SEARCH_RESULT_LIMIT = 8;
const SEARCH_FIELDS =
	"key,title,author_name,first_publish_year,cover_i,isbn,language,number_of_pages_median,publisher,subject";
const MAX_GENRES = 10;

const pace = createRequestPacer(1000);

type SearchDoc = {
	key?: string;
	title?: string;
	author_name?: string[];
	first_publish_year?: number;
	cover_i?: number;
	isbn?: string[];
	language?: string[];
	number_of_pages_median?: number;
	publisher?: string[];
	subject?: string[];
};

type Edition = {
	key?: string;
	title?: string;
	subtitle?: string;
	publishers?: string[];
	publish_date?: string;
	number_of_pages?: number;
	isbn_10?: string[];
	isbn_13?: string[];
	covers?: number[];
	works?: { key?: string }[];
	languages?: { key?: string }[];
	authors?: { key?: string }[];
	description?: string | { value?: string };
};

type Work = {
	key?: string;
	title?: string;
	description?: string | { value?: string };
	subjects?: string[];
	covers?: number[];
	authors?: { author?: { key?: string } }[];
};

class OpenLibraryProvider implements ISearchableMetadataProvider {
	async isAvailable(serverId: string | null | undefined): Promise<boolean> {
		if (!serverId) return true;
		return (await getOpenLibraryConfig(serverId)).enabled;
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
				const config = await getOpenLibraryConfig(input.serverId);
				if (!config.enabled) return emptyMetadataProviderResult();
			}

			const isbn = (input.isbn13 ?? input.isbn10)?.replace(/-/g, "");
			let metadata: Partial<BookMetadata> | null = null;
			if (isbn) {
				metadata = await this.fromIsbn(isbn);
			}
			if (!metadata && input.title) {
				const doc = await this.findBestDoc(
					input.title,
					input.authors?.[0]?.name,
				);
				if (doc) metadata = await this.fromDoc(doc);
			}
			if (!metadata) return emptyMetadataProviderResult();
			const identityEvidence = bookMetadataIdentityEvidence(metadata);

			// Enrichment fills gaps; the existing title always wins.
			metadata.title = undefined;

			if (metadata.cover && !input.cover && input.uuid) {
				const localCoverPath = await this.downloadCover(
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
				const config = await getOpenLibraryConfig(options.serverId);
				if (!config.enabled) return [];
			}

			const title = input.title?.trim();
			if (!title) return [];

			const isbn = extractIsbnFromText(title);
			const docs = await this.queryDocs(
				isbn ? { isbn } : { title, author: input.author },
			);
			return this.rankDocs(docs, isbn ? null : title)
				.slice(0, SEARCH_RESULT_LIMIT)
				.flatMap((doc) => {
					const candidate = this.toCandidate(doc);
					return candidate ? [candidate] : [];
				});
		} catch (error) {
			if (error instanceof ProviderTransientError) throw error;
			log.warn({ err: error }, "Search failed");
			return [];
		}
	}

	// providerId convention: OL key path without the leading slash —
	// "works/OL123W" (search results) or "books/OL456M" (editions).
	async getById(
		providerId: string,
		options?: {
			serverId?: string | null;
			uuid?: string;
			keepRemoteCover?: boolean;
		},
	): Promise<Partial<BookMetadata> | null> {
		try {
			let metadata: Partial<BookMetadata> | null = null;
			if (providerId.startsWith("books/")) {
				const edition = await this.fetchJson<Edition>(
					`${BASE}/${providerId}.json`,
				);
				if (edition) metadata = await this.fromEdition(edition);
			} else if (providerId.startsWith("works/")) {
				metadata = await this.fromWorkKey(`/${providerId}`);
			}
			if (!metadata) return null;

			if (metadata.cover && options?.uuid) {
				const localCoverPath = await this.downloadCover(
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

	// ─── Lookup paths ────────────────────────────────────

	private async fromIsbn(isbn: string): Promise<Partial<BookMetadata> | null> {
		const edition = await this.fetchJson<Edition>(`${BASE}/isbn/${isbn}.json`);
		if (!edition) return null;
		return this.fromEdition(edition);
	}

	private async fromEdition(
		edition: Edition,
	): Promise<Partial<BookMetadata> | null> {
		const workKey = edition.works?.[0]?.key;
		const work = workKey
			? await this.fetchJson<Work>(`${BASE}${workKey}.json`)
			: null;
		const authors = await this.resolveAuthors(edition, work);
		return this.mapEdition(edition, work, authors);
	}

	private async fromWorkKey(
		workKey: string,
	): Promise<Partial<BookMetadata> | null> {
		const work = await this.fetchJson<Work>(`${BASE}${workKey}.json`);
		if (!work) return null;

		// Pick the richest edition, preferring ones that carry an ISBN-13.
		const editionsData = await this.fetchJson<{ entries?: Edition[] }>(
			`${BASE}${workKey}/editions.json?limit=20`,
		);
		const editions = editionsData?.entries ?? [];
		const best = [...editions].sort(
			(a, b) => this.editionScore(b) - this.editionScore(a),
		)[0];
		const authors = await this.resolveAuthors(best ?? null, work);
		return this.mapEdition(best ?? {}, work, authors);
	}

	private editionScore(edition: Edition): number {
		let score = 0;
		if (edition.isbn_13?.length) score += 4;
		if (edition.isbn_10?.length) score += 2;
		if (edition.covers?.length) score += 2;
		if (edition.number_of_pages) score += 1;
		if (edition.publishers?.length) score += 1;
		if (edition.publish_date) score += 1;
		return score;
	}

	private async findBestDoc(
		title: string,
		author?: string,
	): Promise<SearchDoc | null> {
		const docs = await this.queryDocs({ title, author });
		return this.rankDocs(docs, title)[0] ?? null;
	}

	private async fromDoc(doc: SearchDoc): Promise<Partial<BookMetadata> | null> {
		if (!doc.key) return this.mapDoc(doc);
		const full = await this.fromWorkKey(doc.key);
		if (!full) return this.mapDoc(doc);
		// The search doc carries author names without extra requests.
		if (!full.authors?.length && doc.author_name?.length) {
			full.authors = doc.author_name.map((name) => ({
				name,
				role: "Author",
			}));
		}
		return full;
	}

	private async queryDocs(input: {
		title?: string;
		author?: string;
		isbn?: string;
	}): Promise<SearchDoc[]> {
		const url = new URL(`${BASE}/search.json`);
		if (input.isbn) {
			url.searchParams.set("q", `isbn:${input.isbn}`);
		} else {
			if (!input.title) return [];
			url.searchParams.set("title", cleanSearchTerm(input.title));
			if (input.author?.trim()) {
				url.searchParams.set("author", input.author.trim());
			}
		}
		url.searchParams.set("fields", SEARCH_FIELDS);
		url.searchParams.set("limit", "10");
		const data = await this.fetchJson<{ docs?: SearchDoc[] }>(url.toString());
		return (data?.docs ?? []).filter((doc) => doc.title && doc.key);
	}

	private rankDocs(docs: SearchDoc[], inputTitle?: string | null): SearchDoc[] {
		if (!inputTitle) return docs;
		const normalizedInput = normalizeForComparison(cleanSearchTerm(inputTitle));
		return [...docs].sort((a, b) => {
			const similarity = (doc: SearchDoc) =>
				titleSimilarityScore(
					normalizedInput,
					normalizeForComparison(doc.title ?? ""),
				);
			return similarity(b) - similarity(a);
		});
	}

	// ─── Mapping ─────────────────────────────────────────

	private mapEdition(
		edition: Edition,
		work: Work | null,
		authors: { name: string; role: string }[],
	): Partial<BookMetadata> {
		const description =
			this.description(edition.description) ??
			this.description(work?.description);
		const genres = (work?.subjects ?? [])
			.map((subject) => subject.trim())
			.filter((subject) => subject.length > 0 && subject.length <= 60)
			.slice(0, MAX_GENRES);
		const coverId = edition.covers?.[0] ?? work?.covers?.[0];
		const isbn13 = edition.isbn_13?.[0];
		const isbn10 = edition.isbn_10?.[0];
		const languageCode = this.languageCode(edition.languages?.[0]?.key);
		const title = edition.title ?? work?.title;

		return deriveIsbnPair({
			...(title && { title }),
			...(edition.subtitle && { subtitle: edition.subtitle }),
			...(description && { description }),
			...(normalizePublishedDate(edition.publish_date) && {
				publishedDate: normalizePublishedDate(edition.publish_date),
			}),
			...(languageCode && { languageCode }),
			...(edition.number_of_pages && { pageCount: edition.number_of_pages }),
			...(isbn10 && { isbn10 }),
			...(isbn13 && { isbn13 }),
			...(authors.length > 0 && { authors }),
			...(edition.publishers?.[0] && {
				publisher: { name: edition.publishers[0] },
			}),
			...(genres.length > 0 && { genres }),
			cover: coverId
				? `${COVERS}/b/id/${coverId}-L.jpg?default=false`
				: isbn13
					? `${COVERS}/b/isbn/${isbn13}-L.jpg?default=false`
					: null,
		});
	}

	private mapDoc(doc: SearchDoc): Partial<BookMetadata> {
		return {
			...(doc.title && { title: doc.title }),
			...(doc.first_publish_year && {
				publishedDate: `${doc.first_publish_year}-01-01`,
			}),
			...(doc.number_of_pages_median && {
				pageCount: doc.number_of_pages_median,
			}),
			...(doc.author_name?.length && {
				authors: doc.author_name.map((name) => ({ name, role: "Author" })),
			}),
			...(doc.publisher?.[0] && { publisher: { name: doc.publisher[0] } }),
			cover: doc.cover_i
				? `${COVERS}/b/id/${doc.cover_i}-L.jpg?default=false`
				: null,
		};
	}

	// Description is `string | { value }` depending on the record's age.
	private description(
		value: string | { value?: string } | undefined,
	): string | null {
		const raw = typeof value === "string" ? value : value?.value;
		if (!raw) return null;
		const stripped = stripHtml(raw);
		return stripped || null;
	}

	private languageCode(languageKey?: string): string | null {
		// "/languages/jpn" → marc code; map the common ones to ISO 639-1.
		const marc = languageKey?.split("/").pop();
		if (!marc) return null;
		const map: Record<string, string> = {
			eng: "en",
			jpn: "ja",
			spa: "es",
			fre: "fr",
			ger: "de",
			ita: "it",
			por: "pt",
			chi: "zh",
			kor: "ko",
			rus: "ru",
		};
		return map[marc] ?? null;
	}

	// At most one author lookup to respect the ~1 req/s etiquette; search-doc
	// author names cover the common path without extra requests.
	private async resolveAuthors(
		edition: Edition | null,
		work: Work | null,
	): Promise<{ name: string; role: string }[]> {
		const authorKey =
			edition?.authors?.[0]?.key ?? work?.authors?.[0]?.author?.key;
		if (!authorKey) return [];
		const author = await this.fetchJson<{ name?: string }>(
			`${BASE}${authorKey}.json`,
		);
		return author?.name ? [{ name: author.name, role: "Author" }] : [];
	}

	private toCandidate(doc: SearchDoc): BookSearchCandidate | null {
		if (!doc.key || !doc.title) return null;
		return {
			provider: "openlibrary",
			providerId: doc.key.replace(/^\//, ""),
			title: doc.title,
			authors: doc.author_name?.map((name) => ({ name })),
			publishedDate: doc.first_publish_year
				? `${doc.first_publish_year}-01-01`
				: null,
			previewCover: doc.cover_i
				? `${COVERS}/b/id/${doc.cover_i}-M.jpg?default=false`
				: null,
			url: `${BASE}${doc.key}`,
		};
	}

	private async fetchJson<T>(url: string): Promise<T | null> {
		await pace();
		const response = await fetchOrTransient("Open Library", url, {
			headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
		});
		if (!response.ok) {
			if (response.status !== 404) {
				log.warn(
					{ status: response.status, url },
					"Open Library request failed",
				);
			}
			return null;
		}
		return (await response.json()) as T;
	}

	private downloadCover(imageUrl: string, uuid: string) {
		return downloadCoverImage(imageUrl, uuid, {
			headers: { "User-Agent": USER_AGENT },
		});
	}
}

export const openlibraryProvider = new OpenLibraryProvider();
