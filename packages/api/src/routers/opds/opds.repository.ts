import { db } from "@nanahoshi-v2/db";
import { member } from "@nanahoshi-v2/db/schema/auth";
import { bookMetadata } from "@nanahoshi-v2/db/schema/general";
import { asc, eq } from "drizzle-orm";
import { search } from "../../infrastructure/search";
import { authorRepository } from "../authors/author.repository";
import {
	bookCreatedAtDesc,
	bookRepository,
	type LibraryScope,
} from "../books/book.repository";
import { collectionsRepository } from "../collections/collections.repository";
import { listCollectionItems } from "../collections/collections.service";
import { seriesRepository } from "../series/series.repository";
import type { OpdsBookEntry } from "./opds.model";

const PAGE_SIZE = 10;

type CatalogBook = Awaited<
	ReturnType<typeof bookRepository.listPaginated>
>[number];

function toOpdsBook(row: CatalogBook): OpdsBookEntry {
	return {
		uuid: row.uuid,
		title: row.title ?? row.filename,
		filename: row.filename,
		cover: row.cover,
		createdAt: row.createdAt,
		authors: row.authors,
	};
}

function paginate(rows: CatalogBook[]): {
	books: OpdsBookEntry[];
	hasMore: boolean;
} {
	const hasMore = rows.length > PAGE_SIZE;
	return {
		books: rows.slice(0, PAGE_SIZE).map(toOpdsBook),
		hasMore,
	};
}

export class OpdsRepository {
	listDynamicCollections(userId: string, serverId: string) {
		return collectionsRepository.listVisibleDynamic(userId, serverId);
	}

	async listDynamicCollectionItems(
		collectionId: string,
		userId: string,
		serverId: string,
		cursor: number,
		scope: LibraryScope = "ALL",
		query?: string,
	) {
		const result = await listCollectionItems(
			userId,
			{
				collectionId,
				cursor,
				limit: PAGE_SIZE,
				query: query?.trim() || undefined,
				timeZone: "UTC",
			},
			serverId,
			scope,
		);
		return {
			books: result.items.map((item) => ({
				uuid: item.uuid,
				title: item.title ?? item.filename,
				filename: item.filename,
				cover: item.cover,
				createdAt: item.addedAt ?? new Date().toISOString(),
				authors: item.authors.map((person) => ({ name: person.name })),
			})),
			hasMore: result.pagination.hasMore,
			nextCursor: result.pagination.nextCursor,
		};
	}

	/** The organization of the user's first membership, or null if they have none. */
	async getFirstMembershipOrg(userId: string): Promise<string | null> {
		const [firstMembership] = await db
			.select({ serverId: member.organizationId })
			.from(member)
			.where(eq(member.userId, userId))
			.limit(1);
		return firstMembership?.serverId ?? null;
	}

	listAllBooks(serverId: string, page: number, scope: LibraryScope = "ALL") {
		const offset = (page - 1) * PAGE_SIZE;
		return bookRepository
			.listPaginated(
				serverId,
				asc(bookMetadata.title),
				PAGE_SIZE + 1,
				offset,
				scope,
			)
			.then(paginate);
	}

	listRecentBooks(serverId: string, page: number, scope: LibraryScope = "ALL") {
		const offset = (page - 1) * PAGE_SIZE;
		return bookRepository
			.listPaginated(serverId, bookCreatedAtDesc, PAGE_SIZE + 1, offset, scope)
			.then(paginate);
	}

	async listAuthors(
		serverId: string,
		page: number,
		scope: LibraryScope = "ALL",
	): Promise<{
		authors: { id: number; name: string; bookCount: number }[];
		hasMore: boolean;
	}> {
		const offset = (page - 1) * PAGE_SIZE;
		const rows = await authorRepository.listWithBookCount(
			serverId,
			{
				limit: PAGE_SIZE + 1,
				offset,
			},
			scope,
		);
		const hasMore = rows.length > PAGE_SIZE;
		return { authors: rows.slice(0, PAGE_SIZE), hasMore };
	}

	async listBooksByAuthor(
		authorId: number,
		serverId: string,
		page: number,
		scope: LibraryScope = "ALL",
	): Promise<{
		books: OpdsBookEntry[];
		hasMore: boolean;
		authorName: string | null;
	}> {
		const offset = (page - 1) * PAGE_SIZE;
		const [authorName, rows] = await Promise.all([
			bookRepository.getAuthorName(authorId, serverId),
			bookRepository.listByAuthorId(
				authorId,
				serverId,
				PAGE_SIZE + 1,
				offset,
				scope,
			),
		]);
		return { ...paginate(rows), authorName };
	}

	async listSeries(
		serverId: string,
		page: number,
		scope: LibraryScope = "ALL",
	): Promise<{
		series: { id: number; name: string; bookCount: number }[];
		hasMore: boolean;
	}> {
		const offset = (page - 1) * PAGE_SIZE;
		const rows = await seriesRepository.listWithBookCount(
			serverId,
			PAGE_SIZE + 1,
			offset,
			"name",
			scope,
		);
		const hasMore = rows.length > PAGE_SIZE;
		return { series: rows.slice(0, PAGE_SIZE), hasMore };
	}

	async listBooksBySeries(
		seriesId: number,
		serverId: string,
		page: number,
		scope: LibraryScope = "ALL",
	): Promise<{
		books: OpdsBookEntry[];
		hasMore: boolean;
		seriesName: string | null;
	}> {
		const offset = (page - 1) * PAGE_SIZE;
		const [seriesName, rows] = await Promise.all([
			bookRepository.getSeriesName(seriesId, serverId),
			bookRepository.listBySeriesId(
				seriesId,
				serverId,
				PAGE_SIZE + 1,
				offset,
				scope,
			),
		]);
		return { ...paginate(rows), seriesName };
	}

	async searchAuthors(
		query: string,
		serverId: string,
		scope: LibraryScope = "ALL",
	): Promise<{ id: number; name: string; bookCount: number }[]> {
		const result = await search.searchAuthors({
			query,
			serverId,
			limit: 5,
		});
		const rows = await Promise.all(
			result.authors.map(async (a) => {
				const hit = await authorRepository.getVisibleHitByUuid(
					a.uuid,
					serverId,
					scope,
				);
				return hit == null
					? null
					: { id: hit.id, name: hit.name, bookCount: hit.bookCount };
			}),
		);
		return rows.filter((row): row is NonNullable<typeof row> => row != null);
	}

	async searchSeries(
		query: string,
		serverId: string,
		scope: LibraryScope = "ALL",
	): Promise<{ id: number; name: string; bookCount: number }[]> {
		const result = await search.searchSeries({
			query,
			serverId,
			limit: 5,
		});
		const rows = await Promise.all(
			result.series.map(async (s) => {
				const hit = await seriesRepository.getVisibleHitByUuid(
					s.uuid,
					serverId,
					scope,
				);
				return hit == null
					? null
					: { id: hit.id, name: hit.name, bookCount: hit.bookCount };
			}),
		);
		return rows.filter((row): row is NonNullable<typeof row> => row != null);
	}

	async searchBooks(
		query: string,
		serverId: string,
		page: number,
		scope: LibraryScope = "ALL",
	): Promise<{ books: OpdsBookEntry[]; hasMore: boolean }> {
		const offset = (page - 1) * PAGE_SIZE;

		const result = await search.searchBooks({
			query,
			serverId,
			accessibleLibraryIds: scope,
			limit: PAGE_SIZE + 1,
			offset,
		});

		const hasMore = result.books.length > PAGE_SIZE;
		const books = result.books.slice(0, PAGE_SIZE);

		return {
			books: books.map((hit) => ({
				uuid: hit.uuid,
				title: hit.title ?? hit.filename,
				filename: hit.filename,
				cover: hit.cover ?? null,
				createdAt: hit.createdAt,
				authors: (hit.authors ?? []).map((a) => ({
					uuid: a.uuid,
					name: a.name,
				})),
			})),
			hasMore,
		};
	}
}

export const opdsRepository = new OpdsRepository();
