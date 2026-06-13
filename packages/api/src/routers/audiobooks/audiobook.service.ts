import { InternalServerError, NotFoundError } from "../../errors";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import type {
	SearchAudiobooksRequest,
	SearchAudiobooksResponse,
} from "../../infrastructure/search/search.types";
import { logger } from "../../lib/logger";
import { audiobookRepository } from "./audiobook.repository";

export const getAudiobookDetails = async (
	uuid: string,
	organizationId?: string,
) => {
	const audiobook = await audiobookRepository.getDetails(uuid, organizationId);
	if (!audiobook) throw new NotFoundError("Audiobook not found");
	return audiobook;
};

export const listRecentAudiobooks = async (
	limit = 20,
	organizationId?: string,
) => {
	return audiobookRepository.listRecent(limit, organizationId);
};

export const listAudiobooks = async (
	organizationId: string,
	limit: number,
	offset: number,
) => {
	const [items, total] = await Promise.all([
		audiobookRepository.listPaginated(organizationId, limit, offset),
		audiobookRepository.countByOrganization(organizationId),
	]);
	return { items, total };
};

export const searchAudiobooks = async (
	request: SearchAudiobooksRequest,
): Promise<SearchAudiobooksResponse> => {
	if (!request.organizationId) {
		return {
			audiobooks: [],
			pagination: {
				hasMore: false,
				totalHits: 0,
				totalHitsRelation: "eq",
			},
		};
	}

	try {
		return await getSearchProvider().searchAudiobooks(request);
	} catch (err) {
		logger.error({ err }, "[Search] Audiobook search query failed");
		throw new InternalServerError("Search is temporarily unavailable");
	}
};

export const listAudiobooksBySeries = async (
	seriesName: string,
	organizationId?: string,
) => {
	return audiobookRepository.listBySeriesName(seriesName, organizationId);
};

export const listAudiobookSeries = async (
	organizationId?: string,
	options: {
		limit?: number;
		offset?: number;
		sort?: "name" | "books" | "recent";
		query?: string;
	} = {},
) => {
	return audiobookRepository.listSeriesWithCount(organizationId, options);
};

export const countAudiobookSeries = async (organizationId?: string) => {
	return audiobookRepository.countSeries(organizationId);
};

export const getAudioFile = async (
	bookUuid: string,
	fileIndex: number,
	organizationId?: string,
) => {
	const file = await audiobookRepository.getAudioFile(
		bookUuid,
		fileIndex,
		organizationId,
	);
	if (!file) throw new NotFoundError("Audio file not found");
	return file;
};
