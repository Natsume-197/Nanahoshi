import { ORPCError } from "@orpc/server";
import { getBooksIndex } from "../../infrastructure/search/elasticsearch/search.client";
import type { BookComplete } from "./book.model";
import { bookRepository } from "./book.repository";

export const searchBooks = async (query: string): Promise<BookComplete[]> => {
	const booksIndex = await getBooksIndex();
	const result = await booksIndex.search(query);

	return result.hits.hits.map((hit) => {
		const source = hit._source as any;
		return {
			...source,
			id: Number(source.id),
		} as BookComplete;
	});
};

export const getRecentBooks = async (limit = 20, organizationId?: string) => {
	return bookRepository.listRecent(limit, organizationId);
};

export const getRandomBooks = async (limit = 15, organizationId?: string) => {
	return bookRepository.listRandom(limit, organizationId);
};

export const getBookWithMetadata = async (uuid: string) => {
	const book = await bookRepository.getWithMetadata(uuid);
	if (!book) throw new ORPCError("NOT_FOUND", { message: "Book not found" });
	return book;
};
