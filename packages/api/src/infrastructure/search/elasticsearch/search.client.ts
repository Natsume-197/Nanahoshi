import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client, HttpConnection } from "@elastic/elasticsearch";
import { env } from "@nanahoshi-v2/env/server";
import { buildSearchRequest, encodeCursor } from "./search.query";
import type {
	SearchBookHit,
	SearchBooksRequest,
	SearchBooksResponse,
} from "./search.types";

export const esClient = new Client({
	node: env.ELASTICSEARCH_NODE ?? "http://127.0.0.1:9200",
	Connection: HttpConnection,
});

const INDEX_NAME = `${env.ELASTICSEARCH_INDEX_PREFIX}_books`;
const BULK_REQUEST_TIMEOUT_MS = 120_000;

// Load schema and compute hash for change detection
const schemaPath = resolve(import.meta.dirname, "search.schema.json");
const schemaContent = readFileSync(schemaPath, "utf-8");
const schema = JSON.parse(schemaContent);
const schemaHash = createHash("sha256")
	.update(schemaContent)
	.digest("hex")
	.slice(0, 16);
type CreateIndexParams = Parameters<typeof esClient.indices.create>[0];

function buildCreateIndexRequest(): CreateIndexParams {
	return {
		index: INDEX_NAME,
		settings: schema.settings,
		mappings: {
			...schema.mappings,
			_meta: { schema_hash: schemaHash },
		},
	} as unknown as CreateIndexParams;
}

export async function ensureIndex(): Promise<void> {
	const exists = await esClient.indices.exists({ index: INDEX_NAME });

	if (!exists) {
		console.log(`[ES] Creating index "${INDEX_NAME}" (schema: ${schemaHash})`);
		await esClient.indices.create(buildCreateIndexRequest());
		return;
	}

	// Check if schema changed
	const mapping = await esClient.indices.getMapping({ index: INDEX_NAME });
	const indexData = mapping[INDEX_NAME];
	const existingHash = (indexData?.mappings?._meta as Record<string, string>)
		?.schema_hash;

	if (!existingHash) {
		console.log("[ES] Index exists without schema hash (legacy), recreating");
		await recreateIndex();
	} else if (existingHash !== schemaHash) {
		console.log(
			`[ES] Schema changed (${existingHash} → ${schemaHash}), recreating index`,
		);
		await recreateIndex();
	}
}

export async function recreateIndex(): Promise<void> {
	const exists = await esClient.indices.exists({ index: INDEX_NAME });
	if (exists) {
		await esClient.indices.delete({ index: INDEX_NAME });
	}
	await esClient.indices.create(buildCreateIndexRequest());
	console.log(`[ES] Index "${INDEX_NAME}" recreated (schema: ${schemaHash})`);
}

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
	let totalIndexed = 0;
	let totalErrors = 0;

	for (let i = 0; i < books.length; i += chunkSize) {
		const chunk = books.slice(i, i + chunkSize);
		const { indexed, errors } = await indexBooksBulkChunk(chunk);
		totalIndexed += indexed;
		totalErrors += errors;
	}

	return { indexed: totalIndexed, errors: totalErrors };
}

async function indexBooksBulkChunk(
	chunk: Record<string, unknown>[],
): Promise<{ indexed: number; errors: number }> {
	const operations = chunk.flatMap((doc) => [
		{ index: { _index: INDEX_NAME, _id: String(doc.id) } },
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
		console.error(
			`[ES] Bulk chunk had ${failed.length} errors:`,
			JSON.stringify(failed.slice(0, 3), null, 2),
		);

		return {
			indexed: chunk.length - failed.length,
			errors: failed.length,
		};
	} catch (error) {
		if (isElasticsearchTimeout(error) && chunk.length > 1) {
			const nextChunkSize = Math.ceil(chunk.length / 2);
			console.warn(
				`[ES] Bulk chunk of ${chunk.length} docs timed out, retrying in chunks of ${nextChunkSize}`,
			);

			let indexed = 0;
			let errors = 0;

			for (let i = 0; i < chunk.length; i += nextChunkSize) {
				const retryChunk = chunk.slice(i, i + nextChunkSize);
				const result = await indexBooksBulkChunk(retryChunk);
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
		const { organizationId: _organizationId, ...publicSource } = source;
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
			id: Number(publicSource.id),
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

export { INDEX_NAME };
