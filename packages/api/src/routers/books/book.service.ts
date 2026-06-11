import { db } from "@nanahoshi-v2/db";
import { member } from "@nanahoshi-v2/db/schema/auth";
import { and, eq } from "drizzle-orm";
import { InternalServerError, NotFoundError } from "../../errors";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import type {
	SearchBooksRequest,
	SearchBooksResponse,
} from "../../infrastructure/search/search.types";
import { logger } from "../../lib/logger";
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
		return await getSearchProvider().searchBooks(request);
	} catch (err) {
		logger.error({ err }, "[Search] Search query failed");
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

/**
 * Fetches a book by uuid, falling back to the organization the book actually
 * belongs to when it isn't in the caller's active org. The book detail / reader
 * routes only carry a uuid, so a user opening a shared URL for a book in another
 * org they're a member of would otherwise hit a 404. When that happens we
 * resolve the book's org (after verifying membership) and report it back as
 * `switchedOrgId` so the client can switch the active org. If the user isn't a
 * member of the book's org we keep it a plain 404 (don't leak the book's org).
 */
export const getBookResolvingOrg = async (
	uuid: string,
	userId: string,
	activeOrganizationId?: string,
) => {
	if (activeOrganizationId) {
		const book = await bookRepository.getWithMetadata(
			uuid,
			activeOrganizationId,
		);
		if (book) return { book, switchedOrgId: null as string | null };
	}

	const orgId = await bookRepository.getOrganizationId(uuid);
	if (!orgId) throw new NotFoundError("Book not found");

	const [membership] = await db
		.select({ id: member.id })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
		.limit(1);
	if (!membership) throw new NotFoundError("Book not found");

	const book = await bookRepository.getWithMetadata(uuid, orgId);
	if (!book) throw new NotFoundError("Book not found");
	return { book, switchedOrgId: orgId };
};
