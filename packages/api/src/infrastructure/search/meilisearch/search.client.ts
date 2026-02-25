import { type Index, MeiliSearch } from "meilisearch";
import { env } from "@nanahoshi-v2/env/server";
import type { BookComplete } from "../../../routers/books/book.model";

export const meiliClient = new MeiliSearch({
	host: "http://127.0.0.1:7700",
	apiKey: env.MEILI_MASTER_KEY,
});

let booksIndex: Index<BookComplete> | null = null;

export const getBooksIndex = async (): Promise<Index<BookComplete>> => {
	if (booksIndex) return booksIndex;

	const indexName = "books";
	try {
		booksIndex = meiliClient.index(indexName);
		await booksIndex.getRawInfo();
	} catch {
		await meiliClient.createIndex(indexName, { primaryKey: "id" });
		booksIndex = meiliClient.index(indexName);
	}

	await booksIndex.updateSettings({
		typoTolerance: { enabled: true },
		localizedAttributes: [
			{
				locales: ["jpn", "eng"],
				attributePatterns: ["title"],
			},
		],
		sortableAttributes: ["createdAt"],
	});

	return booksIndex;
};
