import { Client, HttpConnection } from "@elastic/elasticsearch";

import { env } from "@nanahoshi-v2/env/server";
import type { BookComplete } from "../../../routers/books/book.model";

export const esClient = new Client({
	node: env.ELASTICSEARCH_NODE,
	Connection: HttpConnection,
});

const INDEX_NAME = `${env.ELASTICSEARCH_INDEX_PREFIX}_books`;

export const getBooksIndex = async () => {
	const exists = await esClient.indices.exists({ index: INDEX_NAME });

	if (!exists) {
		// biome-ignore lint/suspicious/noExplicitAny: Sudachi plugin types are not in the official ES typedefs
		const params: any = {
			index: INDEX_NAME,
			body: {
				settings: {
					analysis: {
						tokenizer: {
							sudachi_tokenizer: {
								type: "sudachi_tokenizer",
								split_mode: "C",
								discard_punctuation: true,
							},
						},
						filter: {
							sudachi_baseform_filter: {
								type: "sudachi_baseform",
							},
							sudachi_part_of_speech_filter: {
								type: "sudachi_part_of_speech",
								stoptags: [
									"助詞",
									"助動詞",
									"記号,一般",
									"記号,読点",
									"記号,句点",
									"記号,空白",
								],
							},
							sudachi_normalizeform_filter: {
								type: "sudachi_normalizedform",
							},
						},
						analyzer: {
							default: {
								type: "custom",
								tokenizer: "sudachi_tokenizer",
								filter: [
									"sudachi_baseform_filter",
									"sudachi_part_of_speech_filter",
									"sudachi_normalizeform_filter",
									"lowercase",
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
						authors: {
							properties: {
								name: { type: "text", analyzer: "default" },
								role: { type: "keyword" },
							},
						},
						description: { type: "text", analyzer: "default" },
						createdAt: { type: "date" },
					},
				},
			},
		};
		await esClient.indices.create(params);
	}

	return {
		index: async (book: BookComplete) => {
			return esClient.index({
				index: INDEX_NAME,
				id: String(book.id),
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
							fields: ["title^3", "authors.name", "description"],
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
