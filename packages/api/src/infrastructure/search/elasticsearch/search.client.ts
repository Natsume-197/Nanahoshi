import { Client } from "@elastic/elasticsearch";
import { env } from "@nanahoshi-v2/env/server";
import type { BookComplete } from "../../../routers/books/book.model";

export const esClient = new Client({
	node: env.ELASTICSEARCH_NODE,
});

const INDEX_NAME = `${env.ELASTICSEARCH_INDEX_PREFIX}_books`;

export const getBooksIndex = async () => {
	const exists = await esClient.indices.exists({ index: INDEX_NAME });

	if (!exists) {
		await esClient.indices.create({
			index: INDEX_NAME,
			body: {
				settings: {
					analysis: {
						analyzer: {
							default: {
								type: "custom",
								tokenizer: "kuromoji_tokenizer",
								filter: [
									"kuromoji_baseform",
									"kuromoji_part_of_speech",
									"cjk_width",
									"lowercase",
									"kuromoji_stemmer",
								],
							},
						},
					},
				},
				mappings: {
					properties: {
						id: { type: "keyword" },
						title: {
							type: "text",
							analyzer: "default",
							fields: {
								keyword: { type: "keyword" },
							},
						},
						author: { type: "text" },
						description: { type: "text", analyzer: "default" },
						createdAt: { type: "date" },
					},
				},
			},
		});
	}

	return {
		index: async (book: BookComplete) => {
			return esClient.index({
				index: INDEX_NAME,
				id: book.id,
				document: book,
			});
		},
		search: async (query: string) => {
			return esClient.search({
				index: INDEX_NAME,
				body: {
					query: {
						multi_match: {
							query,
							fields: ["title^3", "author", "description"],
						},
					},
				},
			});
		},
		delete: async (id: string) => {
			return esClient.delete({
				index: INDEX_NAME,
				id,
			});
		},
	};
};
