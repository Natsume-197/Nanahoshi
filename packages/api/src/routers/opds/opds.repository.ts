import { book, bookMetadata } from "@nanahoshi-v2/db/schema/general";
import { asc, desc } from "drizzle-orm";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import { authorRepository } from "../authors/author.repository";
import { bookRepository } from "../books/book.repository";
import { seriesRepository } from "../series/series.repository";

const PAGE_SIZE = 10;

type CatalogBook = Awaited<
	ReturnType<typeof bookRepository.listPaginated>
>[number];

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

function toOpdsBook(row: CatalogBook): OpdsBook {
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
		authors: row.authors,
	};
}

function paginate(rows: CatalogBook[]): {
	books: OpdsBook[];
	hasMore: boolean;
} {
	const hasMore = rows.length > PAGE_SIZE;
	return {
		books: rows.slice(0, PAGE_SIZE).map(toOpdsBook),
		hasMore,
	};
}

export function listAllBooks(organizationId: string, page: number) {
	const offset = (page - 1) * PAGE_SIZE;
	return bookRepository
		.listPaginated(
			organizationId,
			asc(bookMetadata.title),
			PAGE_SIZE + 1,
			offset,
		)
		.then(paginate);
}

export function listRecentBooks(organizationId: string, page: number) {
	const offset = (page - 1) * PAGE_SIZE;
	return bookRepository
		.listPaginated(organizationId, desc(book.createdAt), PAGE_SIZE + 1, offset)
		.then(paginate);
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
	const [authorName, rows] = await Promise.all([
		bookRepository.getAuthorName(authorId),
		bookRepository.listByAuthorId(
			authorId,
			organizationId,
			PAGE_SIZE + 1,
			offset,
		),
	]);
	return { ...paginate(rows), authorName };
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
	const [seriesName, rows] = await Promise.all([
		bookRepository.getSeriesName(seriesId),
		bookRepository.listBySeriesId(
			seriesId,
			organizationId,
			PAGE_SIZE + 1,
			offset,
		),
	]);
	return { ...paginate(rows), seriesName };
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
	const offset = (page - 1) * PAGE_SIZE;

	const result = await searchProvider.searchBooks({
		query,
		organizationId,
		limit: PAGE_SIZE + 1,
		offset,
	});

	const hasMore = result.books.length > PAGE_SIZE;
	const books = result.books.slice(0, PAGE_SIZE);

	return {
		books: books.map((hit) => ({
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
