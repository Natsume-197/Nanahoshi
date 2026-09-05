import { InternalServerError, NotFoundError } from "../../errors";
import { search } from "../../infrastructure/search";
import type {
	SearchAudiobooksRequest,
	SearchAudiobooksResponse,
} from "../../infrastructure/search/search.types";
import { logger } from "../../lib/logger";
import type { LibraryScope } from "../_shared/library-scope";
import { bookRepository } from "../books/book.repository";
import { getBookLinkPreviewConfig } from "../settings/settings.service";
import { audiobookRepository } from "./audiobook.repository";

export const getAudiobookSharePreview = async (uuid: string) => {
	const serverId = await bookRepository.getOrganizationId(uuid);
	if (!serverId) return null;

	const config = await getBookLinkPreviewConfig(serverId);
	if (!config.enabled) return null;

	return audiobookRepository.getSharePreview(uuid, serverId);
};

export const getAudiobookDetails = async (
	uuid: string,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	// Fail closed: single-item access requires an active org (no scope fallback).
	if (!serverId) throw new NotFoundError("Audiobook not found");
	const audiobook = await audiobookRepository.getDetails(uuid, serverId, scope);
	if (!audiobook) throw new NotFoundError("Audiobook not found");
	return audiobook;
};

export const listRecentAudiobooks = async (
	limit = 20,
	serverId?: string,
	scope: LibraryScope = "ALL",
	compact = false,
) => {
	return audiobookRepository.listRecent(limit, serverId, scope, compact);
};

export const getRandomAudiobooks = async (
	limit = 15,
	serverId?: string,
	scope: LibraryScope = "ALL",
	compact = false,
) => {
	return audiobookRepository.listRandom(limit, serverId, scope, compact);
};

export const listAudiobooks = async (
	serverId: string,
	limit: number,
	offset: number,
	scope: LibraryScope = "ALL",
) => {
	const [items, total] = await Promise.all([
		audiobookRepository.listPaginated(serverId, limit, offset, scope),
		audiobookRepository.countByOrganization(serverId, scope),
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
	if (!request.serverId) return empty;
	if (
		Array.isArray(request.accessibleLibraryIds) &&
		request.accessibleLibraryIds.length === 0
	) {
		return empty;
	}

	try {
		return await search.searchAudiobooks(request);
	} catch (err) {
		logger.error({ err }, "[Search] Audiobook search query failed");
		throw new InternalServerError("Search is temporarily unavailable");
	}
};

export const listAudiobooksBySeries = async (
	seriesUuid: string,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	return audiobookRepository.listBySeriesUuid(seriesUuid, serverId, scope);
};

export const listAudiobookSeries = async (
	serverId?: string,
	options: {
		limit?: number;
		offset?: number;
		sort?: "name" | "books" | "recent" | "random";
		query?: string;
	} = {},
	scope: LibraryScope = "ALL",
) => {
	return audiobookRepository.listSeriesWithCount(serverId, options, scope);
};

export const countAudiobookSeries = async (
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	return audiobookRepository.countSeries(serverId, scope);
};

export const getAudioFile = async (
	bookUuid: string,
	fileIndex: number,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	// Fail closed: streaming a file requires an active org (no scope fallback).
	if (!serverId) throw new NotFoundError("Audio file not found");
	const file = await audiobookRepository.getAudioFile(
		bookUuid,
		fileIndex,
		serverId,
		scope,
	);
	if (!file) throw new NotFoundError("Audio file not found");
	return file;
};
