import { db } from "@nanahoshi-v2/db";
import { member } from "@nanahoshi-v2/db/schema/auth";
import { and, eq } from "drizzle-orm";
import {
	getAccessibleLibraryIds,
	getUserPermissionContext,
} from "../../auth/access.repository";
import { InternalServerError, NotFoundError } from "../../errors";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import type {
	SearchBooksRequest,
	SearchBooksResponse,
} from "../../infrastructure/search/search.types";
import { logger } from "../../lib/logger";
import { bookRepository, type LibraryScope } from "./book.repository";

export const searchBooks = async (
	request: SearchBooksRequest,
): Promise<SearchBooksResponse> => {
	const emptyResult: SearchBooksResponse = {
		books: [],
		pagination: { hasMore: false, totalHits: 0, totalHitsRelation: "eq" },
	};
	if (!request.organizationId) return emptyResult;
	// No accessible libraries → nothing to search (avoid leaking other libraries).
	if (
		request.accessibleLibraryIds !== "ALL" &&
		Array.isArray(request.accessibleLibraryIds) &&
		request.accessibleLibraryIds.length === 0
	) {
		return emptyResult;
	}

	try {
		return await getSearchProvider().searchBooks(request);
	} catch (err) {
		logger.error({ err }, "[Search] Search query failed");
		throw new InternalServerError("Search is temporarily unavailable");
	}
};

export const getRecentBooks = async (
	limit = 20,
	organizationId?: string,
	scope: LibraryScope = "ALL",
) => {
	return bookRepository.listRecent(limit, organizationId, scope);
};

export const getRandomBooks = async (
	limit = 15,
	organizationId?: string,
	scope: LibraryScope = "ALL",
) => {
	return bookRepository.listRandom(limit, organizationId, scope);
};

export const getBookWithMetadata = async (
	uuid: string,
	organizationId?: string,
	scope: LibraryScope = "ALL",
) => {
	if (!organizationId) {
		throw new NotFoundError("Book not found");
	}

	const book = await bookRepository.getWithMetadata(
		uuid,
		organizationId,
		scope,
	);
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
	activeScope: LibraryScope = "ALL",
	isAppOwner = false,
) => {
	if (activeOrganizationId) {
		const book = await bookRepository.getWithMetadata(
			uuid,
			activeOrganizationId,
			activeScope,
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

	// Resolve the user's library access in the *target* org before exposing the book.
	const pc = await getUserPermissionContext(userId, orgId, { isAppOwner });
	const targetScope = await getAccessibleLibraryIds(userId, orgId, pc);

	const book = await bookRepository.getWithMetadata(uuid, orgId, targetScope);
	if (!book) throw new NotFoundError("Book not found");
	return { book, switchedOrgId: orgId };
};
