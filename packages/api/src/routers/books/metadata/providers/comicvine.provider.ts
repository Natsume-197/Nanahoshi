import { logger } from "../../../../lib/logger";
import {
	type ComicvineConfig,
	getComicvineConfig,
} from "../../../settings/settings.service";
import type { BookMetadata } from "../book.metadata.model";
import type {
	BookSearchCandidate,
	ISearchableMetadataProvider,
} from "./IMetadata.provider";
import {
	createRequestPacer,
	downloadCoverImage,
	normalizePublishedDate,
	stripHtml,
} from "./provider.utils";
import {
	cleanSearchTerm,
	normalizeForComparison,
	titleSimilarityScore,
} from "./title-match";

const log = logger.child({ component: "comicvine-provider" });

const API_BASE = "https://comicvine.gamespot.com/api";
// Comicvine rejects requests without a descriptive User-Agent.
const USER_AGENT = "Nanahoshi/2.0 (self-hosted library; metadata enrichment)";
const SEARCH_RESULT_LIMIT = 8;

// Comicvine resource ids are typed by prefix: 4000 = issue, 4050 = volume.
const PREFIX_ISSUE = "4000-";
const PREFIX_VOLUME = "4050-";

const VOLUME_FIELDS =
	"id,name,publisher,start_year,count_of_issues,description,deck,image,site_detail_url";
const ISSUE_FIELDS =
	"id,name,issue_number,cover_date,store_date,description,deck,image,site_detail_url,volume,person_credits";
const SEARCH_FIELDS =
	"id,name,issue_number,cover_date,description,deck,image,site_detail_url,resource_type,start_year,count_of_issues,publisher,volume";

const pace = createRequestPacer(2000);

type ComicImage = {
	original_url?: string;
	medium_url?: string;
	small_url?: string;
};

type ComicResult = {
	id?: number;
	name?: string;
	resource_type?: string;
	issue_number?: string;
	cover_date?: string;
	store_date?: string;
	start_year?: string;
	count_of_issues?: number;
	description?: string;
	deck?: string;
	image?: ComicImage;
	site_detail_url?: string;
	publisher?: { name?: string };
	volume?: { id?: number; name?: string };
	person_credits?: { name?: string; role?: string }[];
};

type ApiResponse<T> = { status_code?: number; results?: T };

class ComicvineProvider implements ISearchableMetadataProvider {
	async getMetadata(
		input: Partial<BookMetadata> & {
			bookId?: number;
			uuid?: string;
			serverId?: string | null;
		},
	): Promise<Partial<BookMetadata>> {
		try {
			const config = await this.getConfig(input.serverId);
			if (!config.enabled || !config.apiKey) return {};

			const title = input.title?.trim();
			if (!title) return {};

			const results = await this.searchApi(title, config);
			const best = this.rank(results, title)[0];
			if (!best?.id) return {};

			// Search results are shallow; refetch the typed resource for credits.
			const providerId = this.resultProviderId(best);
			const metadata = providerId
				? await this.fetchById(providerId, config)
				: null;
			if (!metadata) return {};

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
			if (!config.enabled || !config.apiKey) return [];

			const title = input.title?.trim();
			if (!title) return [];

			const results = await this.searchApi(title, config);
			return this.rank(results, title)
				.slice(0, SEARCH_RESULT_LIMIT)
				.flatMap((result) => {
					const candidate = this.toCandidate(result);
					return candidate ? [candidate] : [];
				});
		} catch (error) {
			log.warn({ err: error }, "Search failed");
			return [];
		}
	}

	// providerId is the typed Comicvine id ("4050-12345" volume, "4000-67890" issue).
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
			if (!config.enabled || !config.apiKey) return null;

			const metadata = await this.fetchById(providerId, config);
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
			log.warn({ err: error, providerId }, "getById failed");
			return null;
		}
	}

	// ─── Comicvine API ───────────────────────────────────

	private async searchApi(
		term: string,
		config: ComicvineConfig,
	): Promise<ComicResult[]> {
		const url = new URL(`${API_BASE}/search/`);
		url.searchParams.set("query", cleanSearchTerm(term));
		url.searchParams.set("resources", "volume,issue");
		url.searchParams.set("limit", "10");
		url.searchParams.set("field_list", SEARCH_FIELDS);
		const data = await this.fetchJson<ApiResponse<ComicResult[]>>(url, config);
		return data?.results ?? [];
	}

	private async fetchById(
		providerId: string,
		config: ComicvineConfig,
	): Promise<Partial<BookMetadata> | null> {
		if (providerId.startsWith(PREFIX_ISSUE)) {
			const url = new URL(`${API_BASE}/issue/${providerId}/`);
			url.searchParams.set("field_list", ISSUE_FIELDS);
			const data = await this.fetchJson<ApiResponse<ComicResult>>(url, config);
			return data?.results ? this.mapIssue(data.results) : null;
		}
		if (providerId.startsWith(PREFIX_VOLUME)) {
			const url = new URL(`${API_BASE}/volume/${providerId}/`);
			url.searchParams.set("field_list", VOLUME_FIELDS);
			const data = await this.fetchJson<ApiResponse<ComicResult>>(url, config);
			return data?.results ? this.mapVolume(data.results) : null;
		}
		return null;
	}

	private async fetchJson<T>(
		url: URL,
		config: ComicvineConfig,
	): Promise<T | null> {
		url.searchParams.set("api_key", config.apiKey ?? "");
		url.searchParams.set("format", "json");
		await pace();
		const response = await fetch(url, {
			headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
		});
		if (!response.ok) {
			log.warn({ status: response.status }, "Comicvine request failed");
			return null;
		}
		const data = (await response.json()) as T & { status_code?: number };
		// status_code 1 = OK; anything else (bad key, throttled) fails soft.
		if (data.status_code !== 1) {
			log.warn({ statusCode: data.status_code }, "Comicvine API error");
			return null;
		}
		return data;
	}

	// ─── Mapping ─────────────────────────────────────────

	private mapVolume(volume: ComicResult): Partial<BookMetadata> {
		const description = volume.description
			? stripHtml(volume.description)
			: (volume.deck ?? undefined);
		return {
			...(volume.name && { title: volume.name }),
			...(description && { description }),
			...(volume.start_year && {
				publishedDate: normalizePublishedDate(volume.start_year) ?? undefined,
			}),
			...(volume.publisher?.name && {
				publisher: { name: volume.publisher.name },
			}),
			cover: this.pickImage(volume.image),
		};
	}

	private mapIssue(issue: ComicResult): Partial<BookMetadata> {
		const description = issue.description
			? stripHtml(issue.description)
			: (issue.deck ?? undefined);
		const position = Number.parseFloat(issue.issue_number ?? "");
		const authors = (issue.person_credits ?? [])
			.filter((credit) => credit.name)
			.map((credit) => ({
				name: credit.name as string,
				role: credit.role ?? null,
			}));
		const title =
			issue.name ??
			(issue.volume?.name && issue.issue_number
				? `${issue.volume.name} #${issue.issue_number}`
				: issue.volume?.name);

		return {
			...(title && { title }),
			...(description && { description }),
			...((issue.cover_date ?? issue.store_date) && {
				publishedDate:
					normalizePublishedDate(issue.cover_date ?? issue.store_date) ??
					undefined,
			}),
			...(authors.length > 0 && { authors }),
			...(issue.volume?.name && {
				series: {
					name: issue.volume.name,
					position: Number.isNaN(position) ? null : position,
				},
			}),
			cover: this.pickImage(issue.image),
		};
	}

	private pickImage(image?: ComicImage): string | null {
		return image?.original_url ?? image?.medium_url ?? image?.small_url ?? null;
	}

	private resultProviderId(result: ComicResult): string | null {
		if (!result.id) return null;
		const prefix =
			result.resource_type === "issue" ? PREFIX_ISSUE : PREFIX_VOLUME;
		return `${prefix}${result.id}`;
	}

	private rank(results: ComicResult[], inputTitle: string): ComicResult[] {
		const normalizedInput = normalizeForComparison(cleanSearchTerm(inputTitle));
		return [...results].sort((a, b) => {
			const similarity = (result: ComicResult) =>
				titleSimilarityScore(
					normalizedInput,
					normalizeForComparison(result.name ?? result.volume?.name ?? ""),
				);
			return similarity(b) - similarity(a);
		});
	}

	private toCandidate(result: ComicResult): BookSearchCandidate | null {
		const providerId = this.resultProviderId(result);
		const isIssue = result.resource_type === "issue";
		const title =
			result.name ??
			(isIssue && result.volume?.name && result.issue_number
				? `${result.volume.name} #${result.issue_number}`
				: (result.volume?.name ?? null));
		if (!providerId || !title) return null;

		const position = Number.parseFloat(result.issue_number ?? "");
		return {
			provider: "comicvine",
			providerId,
			title,
			series:
				isIssue && result.volume?.name
					? {
							name: result.volume.name,
							position: Number.isNaN(position) ? null : position,
						}
					: null,
			publishedDate:
				normalizePublishedDate(
					result.cover_date ?? result.start_year ?? null,
				) ?? null,
			previewCover: this.pickImage(result.image),
			url: result.site_detail_url ?? null,
		};
	}

	private async getConfig(
		serverId: string | null | undefined,
	): Promise<ComicvineConfig> {
		// No org → no API key stored → provider inactive.
		if (!serverId) return { enabled: false };
		return getComicvineConfig(serverId);
	}
}

export const comicvineProvider = new ComicvineProvider();
