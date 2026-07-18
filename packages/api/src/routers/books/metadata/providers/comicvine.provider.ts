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
	fetchOrTransient,
	normalizePublishedDate,
	ProviderTransientError,
	stripHtml,
	TtlCache,
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

// Series siblings ("Saga 1".."Saga 66") re-search the same volume list.
// Misses are cached too — an unknown series repeats for every issue.
const VOLUME_CACHE_TTL_MS = 10 * 60 * 1000;
const VOLUME_CACHE_MAX_ENTRIES = 500;
const MAX_VOLUMES_TO_CHECK = 3;

type SeriesAndIssue = { series: string; issue: string; year: number | null };

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
	async isAvailable(serverId: string | null | undefined): Promise<boolean> {
		const config = await this.getConfig(serverId);
		return config.enabled && Boolean(config.apiKey);
	}

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

			// Structured path first: "Series #12 (2023)" → scored volumes → the
			// exact issue. Far more precise than a general search for comics.
			let metadata: Partial<BookMetadata> | null = null;
			const parsed = this.extractSeriesAndIssue(title);
			if (parsed) {
				metadata = await this.findIssueMetadata(parsed, config);
			}

			if (!metadata) {
				const results = await this.searchApi(title, config);
				const best = this.rank(results, title)[0];
				// Search results are shallow; refetch the typed resource for credits.
				const providerId = best?.id ? this.resultProviderId(best) : null;
				metadata = providerId ? await this.fetchById(providerId, config) : null;
			}
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
			if (error instanceof ProviderTransientError) throw error;
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
			if (error instanceof ProviderTransientError) throw error;
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
			if (error instanceof ProviderTransientError) throw error;
			log.warn({ err: error, providerId }, "getById failed");
			return null;
		}
	}

	// ─── Structured series/issue search ──────────────────

	private volumeCache = new TtlCache<ComicResult[]>(
		VOLUME_CACHE_TTL_MS,
		VOLUME_CACHE_MAX_ENTRIES,
	);

	/** Test hook: volume caches persist across getMetadata calls by design. */
	clearCaches() {
		this.volumeCache.clear();
	}

	// "Saga #12 (2023)" / "Saga 012" → series + issue + optional year.
	// Bracketed release-group noise is stripped first.
	private extractSeriesAndIssue(title: string): SeriesAndIssue | null {
		let work = title;
		const yearMatch = work.match(/\((\d{4})\)/);
		const year = yearMatch?.[1] ? Number(yearMatch[1]) : null;
		if (yearMatch) work = work.replace(yearMatch[0], " ");
		work = work
			.replace(/\[[^\]]*\]/g, " ")
			.replace(/\((?:digital|webrip|c2c|scan)[^)]*\)/gi, " ")
			.replace(/\s+/g, " ")
			.trim();

		const match = work.match(/^(.+?)\s+#?(\d{1,4}(?:\.\d+)?)$/);
		if (!match?.[1] || !match[2]) return null;
		const series = match[1].trim();
		if (!series) return null;
		return { series, issue: match[2], year };
	}

	// "012" → "12", "3.0" → "3": Comicvine stores issue numbers unpadded.
	private normalizeIssueNumber(issue: string | undefined): string {
		if (!issue) return "";
		const num = Number.parseFloat(issue);
		return Number.isNaN(num) ? issue : String(num);
	}

	// Naming quirks between filenames and Comicvine ("The " prefix, " - " vs ": ").
	private seriesNameVariants(series: string): string[] {
		const variants = [series];
		if (/^the\s+/i.test(series)) variants.push(series.replace(/^the\s+/i, ""));
		else variants.push(`The ${series}`);
		if (series.includes(" - ")) variants.push(series.replace(" - ", ": "));
		if (series.includes(": ")) variants.push(series.replace(": ", " - "));
		return [...new Set(variants)];
	}

	private async findIssueMetadata(
		parsed: SeriesAndIssue,
		config: ComicvineConfig,
	): Promise<Partial<BookMetadata> | null> {
		for (const name of this.seriesNameVariants(parsed.series)) {
			const volumes = await this.searchVolumes(name, config);
			if (volumes.length === 0) continue;

			const scored = volumes
				.map((volume, index) => ({
					volume,
					score: this.volumeScore(volume, name, parsed, index),
				}))
				.sort((a, b) => b.score - a.score)
				.slice(0, MAX_VOLUMES_TO_CHECK);

			for (const { volume } of scored) {
				if (!volume.id) continue;
				const issue = await this.findIssueInVolume(
					volume.id,
					parsed.issue,
					config,
				);
				if (issue) {
					const metadata = this.mapIssue(issue);
					// Issues don't carry a publisher; the volume does.
					if (!metadata.publisher && volume.publisher?.name) {
						metadata.publisher = { name: volume.publisher.name };
					}
					return metadata;
				}
			}
		}
		return null;
	}

	private async searchVolumes(
		seriesName: string,
		config: ComicvineConfig,
	): Promise<ComicResult[]> {
		const key = seriesName.toLowerCase();
		const cached = this.volumeCache.get(key);
		if (cached) return cached;

		const searchUrl = new URL(`${API_BASE}/search/`);
		searchUrl.searchParams.set("query", seriesName);
		searchUrl.searchParams.set("resources", "volume");
		searchUrl.searchParams.set("limit", "25");
		searchUrl.searchParams.set("field_list", VOLUME_FIELDS);
		let volumes =
			(await this.fetchJson<ApiResponse<ComicResult[]>>(searchUrl, config))
				?.results ?? [];

		// /search misses some volumes the name filter finds.
		if (volumes.length === 0) {
			const filterUrl = new URL(`${API_BASE}/volumes/`);
			filterUrl.searchParams.set("filter", `name:${seriesName}`);
			filterUrl.searchParams.set("limit", "20");
			filterUrl.searchParams.set("field_list", VOLUME_FIELDS);
			volumes =
				(await this.fetchJson<ApiResponse<ComicResult[]>>(filterUrl, config))
					?.results ?? [];
		}

		this.volumeCache.set(key, volumes);
		return volumes;
	}

	private volumeScore(
		volume: ComicResult,
		seriesName: string,
		parsed: SeriesAndIssue,
		index: number,
	): number {
		let score = Math.max(0, 25 - index); // API relevance order

		if (parsed.year != null && volume.start_year) {
			const startYear = Number.parseInt(volume.start_year, 10);
			if (
				Number.isFinite(startYear) &&
				Math.abs(startYear - parsed.year) <= 1
			) {
				score += 100;
			}
		}

		const name = volume.name?.toLowerCase() ?? "";
		const target = seriesName.toLowerCase();
		if (name === target) score += 50;
		else if (name.includes(target)) score += 25;

		const issueNum = Number.parseFloat(parsed.issue);
		if (
			Number.isFinite(issueNum) &&
			volume.count_of_issues != null &&
			volume.count_of_issues >= issueNum
		) {
			score += 20;
		}
		return score;
	}

	private async findIssueInVolume(
		volumeId: number,
		issueNumber: string,
		config: ComicvineConfig,
	): Promise<ComicResult | null> {
		const normalized = this.normalizeIssueNumber(issueNumber);
		const url = new URL(`${API_BASE}/issues/`);
		url.searchParams.set(
			"filter",
			`volume:${volumeId},issue_number:${normalized}`,
		);
		url.searchParams.set("field_list", ISSUE_FIELDS);
		url.searchParams.set("limit", "5");
		const results =
			(await this.fetchJson<ApiResponse<ComicResult[]>>(url, config))
				?.results ?? [];
		// The filter is fuzzy server-side; verify the issue number really matches.
		return (
			results.find(
				(result) =>
					this.normalizeIssueNumber(result.issue_number) === normalized,
			) ?? null
		);
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
		const response = await fetchOrTransient("Comicvine", url, {
			headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
		});
		if (!response.ok) {
			log.warn({ status: response.status }, "Comicvine request failed");
			return null;
		}
		const data = (await response.json()) as T & { status_code?: number };
		// status_code 1 = OK; other API errors (bad key, not found) fail soft —
		// they're permanent, not transient.
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
