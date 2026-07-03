import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client, HttpConnection } from "@elastic/elasticsearch";
import { env } from "@nanahoshi-v2/env/server";
import { logger } from "../../../lib/logger";
import type {
	SearchAudiobookHit,
	SearchAudiobooksRequest,
	SearchAudiobooksResponse,
} from "../search.types";
import { buildAudiobookSearchRequest } from "./audiobook.query";
import { buildSearchRequest, encodeCursor } from "./search.query";
import type {
	SearchAuthorHit,
	SearchAuthorsRequest,
	SearchAuthorsResponse,
	SearchBookHit,
	SearchBooksRequest,
	SearchBooksResponse,
	SearchSeriesHit,
	SearchSeriesRequest,
	SearchSeriesResponse,
} from "./search.types";

const log = logger.child({ component: "es-search-client" });

export const esClient = new Client({
	node: env.ELASTICSEARCH_NODE ?? "http://127.0.0.1:9200",
	Connection: HttpConnection,
});

const INDEX_NAME = `${env.ELASTICSEARCH_INDEX_PREFIX}_books`;
const AUDIOBOOKS_INDEX_NAME = `${env.ELASTICSEARCH_INDEX_PREFIX}_audiobooks`;
const SERIES_INDEX_NAME = `${env.ELASTICSEARCH_INDEX_PREFIX}_series`;
const AUTHORS_INDEX_NAME = `${env.ELASTICSEARCH_INDEX_PREFIX}_authors`;
const BULK_REQUEST_TIMEOUT_MS = 120_000;

// Load schemas and compute hashes for change detection
function loadSchema(filename: string) {
	const path = resolve(import.meta.dirname, filename);
	const content = readFileSync(path, "utf-8");
	const parsed = JSON.parse(content);
	const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
	return { schema: parsed, hash };
}

const booksSchema = loadSchema("search.schema.json");
const audiobooksSchema = loadSchema("audiobooks.schema.json");
const seriesSchema = loadSchema("series.schema.json");
const authorsSchema = loadSchema("authors.schema.json");

type CreateIndexParams = Parameters<typeof esClient.indices.create>[0];

function buildCreateIndexRequest(
	indexName: string,
	schema: { schema: Record<string, unknown>; hash: string },
): CreateIndexParams {
	return {
		index: indexName,
		settings: schema.schema.settings,
		mappings: {
			...(schema.schema.mappings as Record<string, unknown>),
			_meta: { schema_hash: schema.hash },
		},
	} as unknown as CreateIndexParams;
}

async function ensureSingleIndex(
	indexName: string,
	schema: { schema: Record<string, unknown>; hash: string },
): Promise<void> {
	const exists = await esClient.indices.exists({ index: indexName });

	if (!exists) {
		log.info({ indexName, schemaHash: schema.hash }, "Creating index");
		await esClient.indices.create(buildCreateIndexRequest(indexName, schema));
		return;
	}

	// Check if schema changed
	const mapping = await esClient.indices.getMapping({ index: indexName });
	const indexData = mapping[indexName];
	const existingHash = (indexData?.mappings?._meta as Record<string, string>)
		?.schema_hash;

	if (!existingHash) {
		log.info(
			{ indexName },
			"Index exists without schema hash (legacy), recreating",
		);
		await recreateSingleIndex(indexName, schema);
	} else if (existingHash !== schema.hash) {
		log.info(
			{ indexName, existingHash, schemaHash: schema.hash },
			"Schema changed, recreating",
		);
		await recreateSingleIndex(indexName, schema);
	}
}

async function recreateSingleIndex(
	indexName: string,
	schema: { schema: Record<string, unknown>; hash: string },
): Promise<void> {
	const exists = await esClient.indices.exists({ index: indexName });
	if (exists) {
		await esClient.indices.delete({ index: indexName });
	}
	await esClient.indices.create(buildCreateIndexRequest(indexName, schema));
	log.info({ indexName, schemaHash: schema.hash }, "Index recreated");
}

export async function ensureIndex(): Promise<void> {
	await ensureSingleIndex(INDEX_NAME, booksSchema);
	await ensureSingleIndex(AUDIOBOOKS_INDEX_NAME, audiobooksSchema);
	await ensureSingleIndex(SERIES_INDEX_NAME, seriesSchema);
	await ensureSingleIndex(AUTHORS_INDEX_NAME, authorsSchema);
}

export async function recreateIndex(): Promise<void> {
	await recreateSingleIndex(INDEX_NAME, booksSchema);
	await recreateSingleIndex(AUDIOBOOKS_INDEX_NAME, audiobooksSchema);
	await recreateSingleIndex(SERIES_INDEX_NAME, seriesSchema);
	await recreateSingleIndex(AUTHORS_INDEX_NAME, authorsSchema);
}

// ── Books ──────────────────────────────────────────────────────

export async function indexBook(book: Record<string, unknown>): Promise<void> {
	await esClient.index({
		index: INDEX_NAME,
		id: String(book.id),
		document: book,
	});
}

export async function indexBooksBulk(
	books: Record<string, unknown>[],
	chunkSize = 500,
): Promise<{ indexed: number; errors: number }> {
	return bulkIndex(INDEX_NAME, books, chunkSize);
}

export async function deleteBook(id: string): Promise<void> {
	await esClient
		.delete({ index: INDEX_NAME, id, refresh: true })
		.catch((err) => {
			if (err?.meta?.statusCode !== 404) throw err;
		});
}

export async function deleteByQuery(
	query: Record<string, unknown>,
): Promise<number> {
	const deleteByQueryParams = {
		index: INDEX_NAME,
		query,
		refresh: true,
	} as unknown as Parameters<typeof esClient.deleteByQuery>[0];
	const result = await esClient.deleteByQuery(deleteByQueryParams);
	return result.deleted ?? 0;
}

export async function searchBooks(
	request: SearchBooksRequest,
): Promise<SearchBooksResponse> {
	const searchRequest = buildSearchRequest(INDEX_NAME, request);
	const result = await esClient.search(searchRequest);

	const limit = Math.min(Math.max(request.limit ?? 20, 1), 50);
	const hits = result.hits.hits;
	const hasMore = hits.length === limit;

	const books: SearchBookHit[] = hits.map((hit) => {
		const source = hit._source as Record<string, unknown>;
		const { serverId: _serverId, id: _id, ...publicSource } = source;
		const highlight = hit.highlight;

		// Extract nested author highlights
		let authorHighlight: string | undefined;
		const innerHits = hit.inner_hits?.authors?.hits?.hits;
		if (innerHits?.length && innerHits[0]) {
			const authorHL = innerHits[0].highlight?.["authors.name"];
			if (authorHL?.length) {
				authorHighlight = authorHL[0];
			}
		}

		return {
			...publicSource,
			highlight:
				highlight || authorHighlight
					? {
							title: highlight?.title?.[0],
							description: highlight?.description?.[0],
							authorName: authorHighlight,
						}
					: undefined,
		} as SearchBookHit;
	});

	// Build cursor from last hit's sort values
	let cursor: string | undefined;
	if (hasMore && hits.length > 0) {
		const lastHit = hits.at(-1);
		if (lastHit?.sort) {
			cursor = encodeCursor(lastHit.sort);
		}
	}

	const totalHits = result.hits.total;
	const totalCount =
		typeof totalHits === "number" ? totalHits : (totalHits?.value ?? 0);
	const totalRelation =
		typeof totalHits === "number"
			? "eq"
			: ((totalHits?.relation as "eq" | "gte") ?? "eq");

	return {
		books,
		pagination: {
			cursor,
			hasMore,
			totalHits: totalCount,
			totalHitsRelation: totalRelation,
		},
	};
}

// ── Audiobooks ──────────────────────────────────────────────────

export async function indexAudiobook(
	audiobook: Record<string, unknown>,
): Promise<void> {
	await esClient.index({
		index: AUDIOBOOKS_INDEX_NAME,
		id: String(audiobook.id),
		document: audiobook,
	});
}

export async function indexAudiobooksBulk(
	audiobooks: Record<string, unknown>[],
	chunkSize = 500,
): Promise<{ indexed: number; errors: number }> {
	return bulkIndex(AUDIOBOOKS_INDEX_NAME, audiobooks, chunkSize);
}

export async function deleteAudiobook(id: string): Promise<void> {
	await esClient
		.delete({ index: AUDIOBOOKS_INDEX_NAME, id, refresh: true })
		.catch((err) => {
			if (err?.meta?.statusCode !== 404) throw err;
		});
}

export async function deleteAudiobooksByQuery(
	query: Record<string, unknown>,
): Promise<number> {
	const params = {
		index: AUDIOBOOKS_INDEX_NAME,
		query,
		refresh: true,
	} as unknown as Parameters<typeof esClient.deleteByQuery>[0];
	const result = await esClient.deleteByQuery(params);
	return result.deleted ?? 0;
}

export async function searchAudiobooks(
	request: SearchAudiobooksRequest,
): Promise<SearchAudiobooksResponse> {
	const searchRequest = buildAudiobookSearchRequest(
		AUDIOBOOKS_INDEX_NAME,
		request,
	);
	const result = await esClient.search(searchRequest);

	const limit = Math.min(Math.max(request.limit ?? 20, 1), 50);
	const hits = result.hits.hits;
	const hasMore = hits.length === limit;

	const audiobooks: SearchAudiobookHit[] = hits.map((hit) => {
		const source = hit._source as Record<string, unknown>;
		const { serverId: _serverId, id: _id, ...publicSource } = source;
		const highlight = hit.highlight;

		return {
			...publicSource,
			highlight: highlight
				? {
						title: highlight?.title?.[0],
						description: highlight?.description?.[0],
					}
				: undefined,
		} as SearchAudiobookHit;
	});

	let cursor: string | undefined;
	if (hasMore && hits.length > 0) {
		const lastHit = hits.at(-1);
		if (lastHit?.sort) {
			cursor = encodeCursor(lastHit.sort);
		}
	}

	const totalHits = result.hits.total;
	const totalCount =
		typeof totalHits === "number" ? totalHits : (totalHits?.value ?? 0);
	const totalRelation =
		typeof totalHits === "number"
			? "eq"
			: ((totalHits?.relation as "eq" | "gte") ?? "eq");

	return {
		audiobooks,
		pagination: {
			cursor,
			hasMore,
			totalHits: totalCount,
			totalHitsRelation: totalRelation,
		},
	};
}

// ── Series ─────────────────────────────────────────────────────

export async function indexSeries(
	series: Record<string, unknown>,
): Promise<void> {
	await esClient.index({
		index: SERIES_INDEX_NAME,
		id: String(series.id),
		document: series,
	});
}

export async function indexSeriesBulk(
	series: Record<string, unknown>[],
	chunkSize = 500,
): Promise<{ indexed: number; errors: number }> {
	return bulkIndex(SERIES_INDEX_NAME, series, chunkSize);
}

export async function deleteSeries(id: string): Promise<void> {
	await esClient
		.delete({ index: SERIES_INDEX_NAME, id, refresh: true })
		.catch((err) => {
			if (err?.meta?.statusCode !== 404) throw err;
		});
}

export async function deleteSeriesByQuery(
	query: Record<string, unknown>,
): Promise<number> {
	const params = {
		index: SERIES_INDEX_NAME,
		query,
		refresh: true,
	} as unknown as Parameters<typeof esClient.deleteByQuery>[0];
	const result = await esClient.deleteByQuery(params);
	return result.deleted ?? 0;
}

function buildNameQuery(
	queryText: string,
	serverId?: string,
): Record<string, unknown> {
	const filter: Record<string, unknown>[] = [];
	if (serverId) {
		filter.push({ term: { serverIds: serverId } });
	}
	return {
		bool: {
			must: [
				{
					bool: {
						should: [
							{
								simple_query_string: {
									query: queryText,
									fields: ["name^10", "name.baseform^5", "name.kana^3"],
									default_operator: "and",
									analyze_wildcard: true,
								},
							},
							{
								wildcard: {
									"name.keyword": {
										value: `*${queryText}*`,
										case_insensitive: true,
										boost: 2,
									},
								},
							},
						],
						minimum_should_match: 1,
					},
				},
			],
			filter,
		},
	};
}

export async function searchSeries(
	request: SearchSeriesRequest,
): Promise<SearchSeriesResponse> {
	const limit = Math.min(Math.max(request.limit ?? 5, 1), 50);
	const offset = Math.max(request.offset ?? 0, 0);
	const queryText = request.query?.trim();
	if (!queryText) return { series: [] };

	const result = await esClient.search({
		index: SERIES_INDEX_NAME,
		query: buildNameQuery(queryText, request.serverId),
		from: offset,
		size: limit,
		sort: [{ _score: { order: "desc" } }],
		_source: true,
	});

	const series: SearchSeriesHit[] = result.hits.hits.map((hit) => {
		const source = hit._source as Record<string, unknown>;
		return {
			uuid: source.uuid as string,
			name: source.name as string,
			bookCount: source.bookCount as number,
			cover: (source.cover as string) ?? null,
		};
	});

	return { series };
}

// ── Authors ────────────────────────────────────────────────────

export async function indexAuthor(
	author: Record<string, unknown>,
): Promise<void> {
	await esClient.index({
		index: AUTHORS_INDEX_NAME,
		id: String(author.id),
		document: author,
	});
}

export async function indexAuthorsBulk(
	authors: Record<string, unknown>[],
	chunkSize = 500,
): Promise<{ indexed: number; errors: number }> {
	return bulkIndex(AUTHORS_INDEX_NAME, authors, chunkSize);
}

export async function deleteAuthor(id: string): Promise<void> {
	await esClient
		.delete({ index: AUTHORS_INDEX_NAME, id, refresh: true })
		.catch((err) => {
			if (err?.meta?.statusCode !== 404) throw err;
		});
}

export async function deleteAuthorsByQuery(
	query: Record<string, unknown>,
): Promise<number> {
	const params = {
		index: AUTHORS_INDEX_NAME,
		query,
		refresh: true,
	} as unknown as Parameters<typeof esClient.deleteByQuery>[0];
	const result = await esClient.deleteByQuery(params);
	return result.deleted ?? 0;
}

export async function searchAuthors(
	request: SearchAuthorsRequest,
): Promise<SearchAuthorsResponse> {
	const limit = Math.min(Math.max(request.limit ?? 5, 1), 10);
	const queryText = request.query?.trim();
	if (!queryText) return { authors: [] };

	const result = await esClient.search({
		index: AUTHORS_INDEX_NAME,
		query: buildNameQuery(queryText, request.serverId),
		size: limit,
		sort: [{ _score: { order: "desc" } }],
		_source: true,
	});

	const authors: SearchAuthorHit[] = result.hits.hits.map((hit) => {
		const source = hit._source as Record<string, unknown>;
		return {
			uuid: source.uuid as string,
			name: source.name as string,
			bookCount: source.bookCount as number,
		};
	});

	return { authors };
}

// ── Shared bulk index helper ───────────────────────────────────

async function bulkIndex(
	indexName: string,
	docs: Record<string, unknown>[],
	chunkSize = 500,
): Promise<{ indexed: number; errors: number }> {
	let totalIndexed = 0;
	let totalErrors = 0;

	for (let i = 0; i < docs.length; i += chunkSize) {
		const chunk = docs.slice(i, i + chunkSize);
		const { indexed, errors } = await bulkIndexChunk(indexName, chunk);
		totalIndexed += indexed;
		totalErrors += errors;
	}

	return { indexed: totalIndexed, errors: totalErrors };
}

async function bulkIndexChunk(
	indexName: string,
	chunk: Record<string, unknown>[],
): Promise<{ indexed: number; errors: number }> {
	const operations = chunk.flatMap((doc) => [
		{ index: { _index: indexName, _id: String(doc.id) } },
		doc,
	]);

	try {
		const result = await esClient.bulk(
			{
				refresh: false,
				operations,
			},
			{
				requestTimeout: BULK_REQUEST_TIMEOUT_MS,
			},
		);

		if (!result.errors) {
			return { indexed: chunk.length, errors: 0 };
		}

		const failed = result.items.filter((item) => item.index?.error);
		log.error(
			{ indexName, errorCount: failed.length, sample: failed.slice(0, 3) },
			"Bulk chunk had errors",
		);

		return {
			indexed: chunk.length - failed.length,
			errors: failed.length,
		};
	} catch (error) {
		if (isElasticsearchTimeout(error) && chunk.length > 1) {
			const nextChunkSize = Math.ceil(chunk.length / 2);
			log.warn(
				{ indexName, chunkSize: chunk.length, nextChunkSize },
				"Bulk chunk timed out, retrying in smaller chunks",
			);

			let indexed = 0;
			let errors = 0;

			for (let i = 0; i < chunk.length; i += nextChunkSize) {
				const retryChunk = chunk.slice(i, i + nextChunkSize);
				const result = await bulkIndexChunk(indexName, retryChunk);
				indexed += result.indexed;
				errors += result.errors;
			}

			return { indexed, errors };
		}

		throw error;
	}
}

function isElasticsearchTimeout(error: unknown): boolean {
	return error instanceof Error && error.name === "TimeoutError";
}

export {
	AUDIOBOOKS_INDEX_NAME,
	AUTHORS_INDEX_NAME,
	INDEX_NAME,
	SERIES_INDEX_NAME,
};
