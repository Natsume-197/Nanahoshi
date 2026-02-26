import { getBooksIndex } from "../../infrastructure/search/elasticsearch/search.client";
import { bookRepository } from "./book.repository";
import type { BookComplete } from "./book.model";

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

export const getBookWithMetadata = async (uuid: string) => {
	const book = await bookRepository.getWithMetadata(uuid);
	if (!book) throw new Error("Book not found");
	return book;
};
