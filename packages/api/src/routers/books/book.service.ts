import { InternalServerError, NotFoundError } from "../../errors";
import { logger } from "../../lib/logger";
import { searchBooks as esSearchBooks } from "../../infrastructure/search/elasticsearch/search.client";
import type {
	SearchBooksRequest,
	SearchBooksResponse,
} from "../../infrastructure/search/elasticsearch/search.types";
import { bookRepository } from "./book.repository";

export const searchBooks = async (
	request: SearchBooksRequest,
): Promise<SearchBooksResponse> => {
	if (!request.organizationId) {
		return {
			books: [],
			pagination: {
				hasMore: false,
				totalHits: 0,
				totalHitsRelation: "eq",
			},
		};
	}

	try {
		return await esSearchBooks(request);
	} catch (err) {
		logger.error({ err }, "[Search] Elasticsearch query failed");
		throw new InternalServerError("Search is temporarily unavailable");
	}
};

export const getRecentBooks = async (limit = 20, organizationId?: string) => {
	return bookRepository.listRecent(limit, organizationId);
};

export const getRandomBooks = async (limit = 15, organizationId?: string) => {
	return bookRepository.listRandom(limit, organizationId);
};

export const getBookWithMetadata = async (
	uuid: string,
	organizationId?: string,
) => {
	if (!organizationId) {
		throw new NotFoundError("Book not found");
	}

	const book = await bookRepository.getWithMetadata(uuid, organizationId);
	if (!book) throw new NotFoundError("Book not found");
	return book;
};
