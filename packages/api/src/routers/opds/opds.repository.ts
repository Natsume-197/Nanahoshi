import { db } from "@nanahoshi-v2/db";
import { member } from "@nanahoshi-v2/db/schema/auth";
import { book, bookMetadata } from "@nanahoshi-v2/db/schema/general";
import { asc, desc, eq } from "drizzle-orm";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import { authorRepository } from "../authors/author.repository";
import { bookRepository, type LibraryScope } from "../books/book.repository";
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
			.listPaginated(
				serverId,
				desc(book.createdAt),
				PAGE_SIZE + 1,
				offset,
				scope,
			)
			.then(paginate);
	}

	async listAuthors(
		serverId: string,
		page: number,
	): Promise<{
		authors: { id: number; name: string; bookCount: number }[];
		hasMore: boolean;
	}> {
		const offset = (page - 1) * PAGE_SIZE;
		const rows = await authorRepository.listWithBookCount(
			serverId,
			PAGE_SIZE + 1,
			offset,
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
			bookRepository.getAuthorName(authorId),
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
	): Promise<{
		series: { id: number; name: string; bookCount: number }[];
		hasMore: boolean;
	}> {
		const offset = (page - 1) * PAGE_SIZE;
		const rows = await seriesRepository.listWithBookCount(
			serverId,
			PAGE_SIZE + 1,
			offset,
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
			bookRepository.getSeriesName(seriesId),
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
	): Promise<{ id: number; name: string; bookCount: number }[]> {
		const searchProvider = getSearchProvider();
		const result = await searchProvider.searchAuthors({
			query,
			serverId,
			limit: 5,
		});
		return result.authors.map((a) => ({
			id: a.id,
			name: a.name,
			bookCount: a.bookCount,
		}));
	}

	async searchSeries(
		query: string,
		serverId: string,
	): Promise<{ id: number; name: string; bookCount: number }[]> {
		const searchProvider = getSearchProvider();
		const result = await searchProvider.searchSeries({
			query,
			serverId,
			limit: 5,
		});
		return result.series.map((s) => ({
			id: s.id,
			name: s.name,
			bookCount: s.bookCount,
		}));
	}

	async searchBooks(
		query: string,
		serverId: string,
		page: number,
		scope: LibraryScope = "ALL",
	): Promise<{ books: OpdsBookEntry[]; hasMore: boolean }> {
		const searchProvider = getSearchProvider();
		const offset = (page - 1) * PAGE_SIZE;

		const result = await searchProvider.searchBooks({
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
					id: a.id ?? 0,
					name: a.name,
				})),
			})),
			hasMore,
		};
	}
}

export const opdsRepository = new OpdsRepository();
