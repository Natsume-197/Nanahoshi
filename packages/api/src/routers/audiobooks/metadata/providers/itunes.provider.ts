import { COVER_STORE_MAX_DIM } from "../../../../lib/cover-ladder";
import { logger } from "../../../../lib/logger";
import type { AudiobookMetadata } from "../audiobook-metadata.model";
import type {
	AudiobookSearchCandidate,
	IAudiobookMetadataProvider,
	ProviderRequestOptions,
} from "./IMetadata.provider";
import {
	createThrottledFetchJson,
	downloadCover,
	stripHtml,
} from "./provider.helpers";

const log = logger.child({ component: "itunes-provider" });

const ITUNES_BASE = "https://itunes.apple.com";

/** Apple caps the Search API at ~20 req/min */
const fetchJson = createThrottledFetchJson({ minDelayMs: 3_100, log });

// Audible region → iTunes storefront country
const REGION_COUNTRY_MAP: Record<string, string> = {
	us: "US",
	uk: "GB",
	au: "AU",
	ca: "CA",
	de: "DE",
	es: "ES",
	fr: "FR",
	in: "IN",
	it: "IT",
	jp: "JP",
};

type ITunesAudiobook = {
	wrapperType?: string;
	collectionId: number;
	collectionName?: string;
	artistName?: string;
	description?: string;
	releaseDate?: string;
	primaryGenreName?: string;
	artworkUrl100?: string;
	collectionViewUrl?: string;
};

// Apple serves whatever rendition the filename asks for and never upscales, so
// requesting above the native size just yields the native size. The 600x600 this
// replaced was capping audiobook covers below what the detail page renders at 2x.
function upscaleArtwork(url: string): string {
	return url.replace(
		/100x100(bb)?/,
		`${COVER_STORE_MAX_DIM}x${COVER_STORE_MAX_DIM}$1`,
	);
}

function countryParam(region: string | undefined): string | undefined {
	return REGION_COUNTRY_MAP[region ?? "us"];
}

function mapToCandidate(item: ITunesAudiobook): AudiobookSearchCandidate {
	return {
		provider: "itunes",
		providerId: String(item.collectionId),
		previewCover: item.artworkUrl100
			? upscaleArtwork(item.artworkUrl100)
			: undefined,
		url: item.collectionViewUrl || undefined,
		title: item.collectionName || undefined,
		authors: item.artistName
			? item.artistName
					.split(/\s*[,&]\s*/)
					.filter(Boolean)
					.map((name) => ({ name, role: "Author" }))
			: undefined,
		description: item.description ? stripHtml(item.description) : undefined,
		publishedDate: item.releaseDate?.slice(0, 10) || undefined,
		genres: item.primaryGenreName ? [item.primaryGenreName] : undefined,
	};
}

class ITunesProvider implements IAudiobookMetadataProvider {
	readonly id = "itunes" as const;

	async search(
		input: { title?: string; authors?: { name: string }[] },
		options?: ProviderRequestOptions,
	): Promise<AudiobookSearchCandidate[]> {
		if (!input.title) return [];

		const term = [input.title, input.authors?.[0]?.name]
			.filter(Boolean)
			.join(" ");
		const params = new URLSearchParams({
			term,
			media: "audiobook",
			limit: "10",
		});
		const country = countryParam(options?.region);
		if (country) params.set("country", country);

		const data = await fetchJson<{ results?: ITunesAudiobook[] }>(
			`${ITUNES_BASE}/search?${params}`,
		);
		return (data?.results ?? [])
			.filter((r) => r.collectionId != null)
			.map(mapToCandidate);
	}

	async getById(
		providerId: string,
		options?: ProviderRequestOptions & { bookUuid?: string },
	): Promise<Partial<AudiobookMetadata> | null> {
		const params = new URLSearchParams({ id: providerId });
		const country = countryParam(options?.region);
		if (country) params.set("country", country);

		const data = await fetchJson<{ results?: ITunesAudiobook[] }>(
			`${ITUNES_BASE}/lookup?${params}`,
		);
		const item = data?.results?.[0];
		if (!item) return null;

		const {
			provider: _p,
			providerId: _id,
			previewCover: _preview,
			...metadata
		} = mapToCandidate(item);

		if (item.artworkUrl100 && options?.bookUuid) {
			const cover = await downloadCover(
				upscaleArtwork(item.artworkUrl100),
				options.bookUuid,
				log,
			);
			if (cover) metadata.cover = cover;
		}

		return metadata;
	}
	// no getChapters — iTunes has no chapter data
}

export const itunesProvider = new ITunesProvider();
