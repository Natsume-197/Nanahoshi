import { db } from "@nanahoshi-v2/db";
import {
	author,
	book,
	bookAuthor,
	bookMetadata,
	bookSeries,
	library,
	publisher,
	series,
} from "@nanahoshi-v2/db/schema/general";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import { authorRepository } from "../authors/author.repository";
import { seriesRepository } from "../series/series.repository";

const PAGE_SIZE = 30;

interface OpdsBook {
	id: number;
	uuid: string;
	title: string;
	filename: string;
	description: string | null;
	cover: string | null;
	languageCode: string | null;
	publisherName: string | null;
	isbn13: string | null;
	isbn10: string | null;
	publishedDate: string | null;
	filesizeKb: number | null;
	createdAt: string;
	seriesName: string | null;
	seriesPosition: number | null;
	authors: { id: number; name: string }[];
}

const bookColumns = {
	id: book.id,
	uuid: book.uuid,
	filename: book.filename,
	filesizeKb: book.filesizeKb,
	createdAt: book.createdAt,
	title: bookMetadata.title,
	description: bookMetadata.description,
	cover: bookMetadata.cover,
	languageCode: bookMetadata.languageCode,
	isbn13: bookMetadata.isbn13,
	isbn10: bookMetadata.isbn10,
	publishedDate: bookMetadata.publishedDate,
	publisherName: publisher.name,
	seriesName: series.name,
	seriesPosition: bookSeries.position,
};

async function attachAuthors(
	rows: { id: number }[],
): Promise<Map<number, { id: number; name: string }[]>> {
	const bookIds = rows.map((r) => r.id);
	const authorsMap = new Map<number, { id: number; name: string }[]>();
	if (bookIds.length === 0) return authorsMap;

	const authorRows = await db
		.select({
			bookId: bookAuthor.bookId,
			authorId: author.id,
			name: author.name,
		})
		.from(bookAuthor)
		.innerJoin(author, eq(author.id, bookAuthor.authorId))
		.where(inArray(bookAuthor.bookId, bookIds));

	for (const row of authorRows) {
		const list = authorsMap.get(Number(row.bookId)) ?? [];
		list.push({ id: row.authorId, name: row.name });
		authorsMap.set(Number(row.bookId), list);
	}
	return authorsMap;
}

type BookRow = {
	id: number;
	uuid: string;
	filename: string;
	filesizeKb: number | null;
	createdAt: string;
	title: string | null;
	description: string | null;
	cover: string | null;
	languageCode: string | null;
	isbn13: string | null;
	isbn10: string | null;
	publishedDate: string | null;
	publisherName: string | null;
	seriesName: string | null;
	seriesPosition: number | null;
};

function toOpdsBook(
	row: BookRow,
	authorsMap: Map<number, { id: number; name: string }[]>,
): OpdsBook {
	return {
		id: row.id,
		uuid: row.uuid,
		title: row.title ?? row.filename,
		filename: row.filename,
		description: row.description,
		cover: row.cover,
		languageCode: row.languageCode,
		publisherName: row.publisherName,
		isbn13: row.isbn13,
		isbn10: row.isbn10,
		publishedDate: row.publishedDate,
		filesizeKb: row.filesizeKb,
		createdAt: row.createdAt,
		seriesName: row.seriesName,
		seriesPosition: row.seriesPosition,
		authors: authorsMap.get(row.id) ?? [],
	};
}

function paginateBooks(
	rows: BookRow[],
	authorsMap: Map<number, { id: number; name: string }[]>,
): { books: OpdsBook[]; hasMore: boolean } {
	const hasMore = rows.length > PAGE_SIZE;
	const items = rows.slice(0, PAGE_SIZE);
	return {
		books: items.map((row) => toOpdsBook(row, authorsMap)),
		hasMore,
	};
}

async function listBooksForOrg(
	organizationId: string,
	page: number,
	orderBy: Parameters<typeof db.select>[0] extends infer _T
		? ReturnType<typeof asc>
		: never,
): Promise<{ books: OpdsBook[]; hasMore: boolean }> {
	const offset = (page - 1) * PAGE_SIZE;

	const rows = await db
		.select(bookColumns)
		.from(book)
		.innerJoin(library, eq(library.id, book.libraryId))
		.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
		.leftJoin(publisher, eq(publisher.id, bookMetadata.publisherId))
		.leftJoin(bookSeries, eq(bookSeries.bookId, book.id))
		.leftJoin(series, eq(series.id, bookSeries.seriesId))
		.where(eq(library.organizationId, organizationId))
		.orderBy(orderBy)
		.limit(PAGE_SIZE + 1)
		.offset(offset);

	const authorsMap = await attachAuthors(rows.slice(0, PAGE_SIZE));
	return paginateBooks(rows, authorsMap);
}

export function listAllBooks(organizationId: string, page: number) {
	return listBooksForOrg(organizationId, page, asc(bookMetadata.title));
}

export function listRecentBooks(organizationId: string, page: number) {
	return listBooksForOrg(organizationId, page, desc(book.createdAt));
}

export async function listAuthors(
	organizationId: string,
	page: number,
): Promise<{
	authors: { id: number; name: string; bookCount: number }[];
	hasMore: boolean;
}> {
	const offset = (page - 1) * PAGE_SIZE;
	const rows = await authorRepository.listWithBookCount(
		organizationId,
		PAGE_SIZE + 1,
		offset,
	);

	const hasMore = rows.length > PAGE_SIZE;
	return { authors: rows.slice(0, PAGE_SIZE), hasMore };
}

export async function listBooksByAuthor(
	authorId: number,
	organizationId: string,
	page: number,
): Promise<{ books: OpdsBook[]; hasMore: boolean; authorName: string | null }> {
	const offset = (page - 1) * PAGE_SIZE;

	const [authorRows, rows] = await Promise.all([
		db
			.select({ name: author.name })
			.from(author)
			.where(eq(author.id, authorId))
			.limit(1),
		db
			.select(bookColumns)
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.innerJoin(bookAuthor, eq(bookAuthor.bookId, book.id))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.leftJoin(publisher, eq(publisher.id, bookMetadata.publisherId))
			.leftJoin(bookSeries, eq(bookSeries.bookId, book.id))
			.leftJoin(series, eq(series.id, bookSeries.seriesId))
			.where(
				and(
					eq(library.organizationId, organizationId),
					eq(bookAuthor.authorId, authorId),
				),
			)
			.orderBy(desc(book.createdAt))
			.limit(PAGE_SIZE + 1)
			.offset(offset),
	]);

	const authorsMap = await attachAuthors(rows.slice(0, PAGE_SIZE));
	const result = paginateBooks(rows, authorsMap);
	return { ...result, authorName: authorRows[0]?.name ?? null };
}

export async function listSeries(
	organizationId: string,
	page: number,
): Promise<{
	series: { id: number; name: string; bookCount: number }[];
	hasMore: boolean;
}> {
	const offset = (page - 1) * PAGE_SIZE;
	const rows = await seriesRepository.listWithBookCount(
		organizationId,
		PAGE_SIZE + 1,
		offset,
	);

	const hasMore = rows.length > PAGE_SIZE;
	return { series: rows.slice(0, PAGE_SIZE), hasMore };
}

export async function listBooksBySeries(
	seriesId: number,
	organizationId: string,
	page: number,
): Promise<{ books: OpdsBook[]; hasMore: boolean; seriesName: string | null }> {
	const offset = (page - 1) * PAGE_SIZE;

	const [seriesRows, rows] = await Promise.all([
		db
			.select({ name: series.name })
			.from(series)
			.where(eq(series.id, seriesId))
			.limit(1),
		db
			.select(bookColumns)
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.innerJoin(bookSeries, eq(bookSeries.bookId, book.id))
			.innerJoin(series, eq(series.id, bookSeries.seriesId))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.leftJoin(publisher, eq(publisher.id, bookMetadata.publisherId))
			.where(
				and(
					eq(library.organizationId, organizationId),
					eq(bookSeries.seriesId, seriesId),
				),
			)
			.orderBy(asc(bookSeries.position))
			.limit(PAGE_SIZE + 1)
			.offset(offset),
	]);

	const authorsMap = await attachAuthors(rows.slice(0, PAGE_SIZE));
	const result = paginateBooks(rows, authorsMap);
	return { ...result, seriesName: seriesRows[0]?.name ?? null };
}

export async function searchAuthors(
	query: string,
	organizationId: string,
): Promise<{ id: number; name: string; bookCount: number }[]> {
	const searchProvider = getSearchProvider();
	const result = await searchProvider.searchAuthors({
		query,
		organizationId,
		limit: 5,
	});
	return result.authors.map((a) => ({
		id: a.id,
		name: a.name,
		bookCount: a.bookCount,
	}));
}

export async function searchSeries(
	query: string,
	organizationId: string,
): Promise<{ id: number; name: string; bookCount: number }[]> {
	const searchProvider = getSearchProvider();
	const result = await searchProvider.searchSeries({
		query,
		organizationId,
		limit: 5,
	});
	return result.series.map((s) => ({
		id: s.id,
		name: s.name,
		bookCount: s.bookCount,
	}));
}

export async function searchBooks(
	query: string,
	organizationId: string,
	page: number,
): Promise<{ books: OpdsBook[]; hasMore: boolean }> {
	const searchProvider = getSearchProvider();

	// Search providers cap at 50 results. Fetch the max and paginate within.
	// OPDS clients rarely paginate deep into search results.
	const SEARCH_MAX = 50;
	const result = await searchProvider.searchBooks({
		query,
		organizationId,
		limit: SEARCH_MAX,
	});

	const offset = (page - 1) * PAGE_SIZE;
	const pageItems = result.books.slice(offset, offset + PAGE_SIZE);
	const hasMore = result.books.length > offset + PAGE_SIZE;

	return {
		books: pageItems.map((hit) => ({
			id: hit.id,
			uuid: hit.uuid,
			title: hit.title ?? hit.filename,
			filename: hit.filename,
			description: hit.description ?? null,
			cover: hit.cover ?? null,
			languageCode: hit.languageCode ?? null,
			publisherName: hit.publisher?.name ?? null,
			isbn13: hit.isbn13 ?? null,
			isbn10: hit.isbn10 ?? null,
			publishedDate: hit.publishedDate ?? null,
			filesizeKb: hit.filesizeKb ?? null,
			createdAt: hit.createdAt,
			seriesName: hit.series?.name ?? null,
			seriesPosition: hit.series?.position ?? null,
			authors: (hit.authors ?? []).map((a) => ({
				id: a.id ?? 0,
				name: a.name,
			})),
		})),
		hasMore,
	};
}
