import { InternalServerError, NotFoundError } from "../../errors";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import type {
	SearchAudiobooksRequest,
	SearchAudiobooksResponse,
} from "../../infrastructure/search/search.types";
import { logger } from "../../lib/logger";
import type { LibraryScope } from "../_shared/library-scope";
import { audiobookRepository } from "./audiobook.repository";

export const getAudiobookDetails = async (
	uuid: string,
	organizationId?: string,
	scope: LibraryScope = "ALL",
) => {
	const audiobook = await audiobookRepository.getDetails(
		uuid,
		organizationId,
		scope,
	);
	if (!audiobook) throw new NotFoundError("Audiobook not found");
	return audiobook;
};

export const listRecentAudiobooks = async (
	limit = 20,
	organizationId?: string,
	scope: LibraryScope = "ALL",
) => {
	return audiobookRepository.listRecent(limit, organizationId, scope);
};

export const listAudiobooks = async (
	organizationId: string,
	limit: number,
	offset: number,
	scope: LibraryScope = "ALL",
) => {
	const [items, total] = await Promise.all([
		audiobookRepository.listPaginated(organizationId, limit, offset, scope),
		audiobookRepository.countByOrganization(organizationId, scope),
	]);
	return { items, total };
};

export const searchAudiobooks = async (
	request: SearchAudiobooksRequest,
): Promise<SearchAudiobooksResponse> => {
	const empty: SearchAudiobooksResponse = {
		audiobooks: [],
		pagination: { hasMore: false, totalHits: 0, totalHitsRelation: "eq" },
	};
	if (!request.organizationId) return empty;
	if (
		Array.isArray(request.accessibleLibraryIds) &&
		request.accessibleLibraryIds.length === 0
	) {
		return empty;
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
	scope: LibraryScope = "ALL",
) => {
	return audiobookRepository.listBySeriesName(
		seriesName,
		organizationId,
		scope,
	);
};

export const listAudiobookSeries = async (
	organizationId?: string,
	options: {
		limit?: number;
		offset?: number;
		sort?: "name" | "books" | "recent";
		query?: string;
	} = {},
	scope: LibraryScope = "ALL",
) => {
	return audiobookRepository.listSeriesWithCount(
		organizationId,
		options,
		scope,
	);
};

export const countAudiobookSeries = async (
	organizationId?: string,
	scope: LibraryScope = "ALL",
) => {
	return audiobookRepository.countSeries(organizationId, scope);
};

export const getAudioFile = async (
	bookUuid: string,
	fileIndex: number,
	organizationId?: string,
	scope: LibraryScope = "ALL",
) => {
	const file = await audiobookRepository.getAudioFile(
		bookUuid,
		fileIndex,
		organizationId,
		scope,
	);
	if (!file) throw new NotFoundError("Audio file not found");
	return file;
};
