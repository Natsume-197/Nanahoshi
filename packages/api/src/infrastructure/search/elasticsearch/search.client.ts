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
	node: env.ELASTICSEARCH_NODE,
	Connection: HttpConnection,
});

const INDEX_NAME = `${env.ELASTICSEARCH_INDEX_PREFIX}_books`;

// Load schema and compute hash for change detection
const schemaPath = resolve(import.meta.dirname, "search.schema.json");
const schemaContent = readFileSync(schemaPath, "utf-8");
const schema = JSON.parse(schemaContent);
const schemaHash = createHash("sha256")
	.update(schemaContent)
	.digest("hex")
	.slice(0, 16);
type CreateIndexParams = Parameters<typeof esClient.indices.create>[0];

export async function ensureIndex(): Promise<void> {
	const exists = await esClient.indices.exists({ index: INDEX_NAME });

	if (!exists) {
		console.log(`[ES] Creating index "${INDEX_NAME}" (schema: ${schemaHash})`);
		const createIndexRequest = {
			index: INDEX_NAME,
			settings: schema.settings,
			mappings: {
				...schema.mappings,
				_meta: { schema_hash: schemaHash },
			},
		} as unknown as CreateIndexParams;
		await esClient.indices.create(createIndexRequest);
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
	const createIndexRequest = {
		index: INDEX_NAME,
		settings: schema.settings,
		mappings: {
			...schema.mappings,
			_meta: { schema_hash: schemaHash },
		},
	} as unknown as CreateIndexParams;
	await esClient.indices.create(createIndexRequest);
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
		const operations = chunk.flatMap((doc) => [
			{ index: { _index: INDEX_NAME, _id: String(doc.id) } },
			doc,
		]);

		const result = await esClient.bulk({ refresh: false, operations });
		if (result.errors) {
			const failed = result.items.filter((item) => item.index?.error);
			totalErrors += failed.length;
			console.error(
				`[ES] Bulk chunk had ${failed.length} errors:`,
				JSON.stringify(failed.slice(0, 3), null, 2),
			);
		}
		totalIndexed +=
			chunk.length -
			(result.errors
				? result.items.filter((item) => item.index?.error).length
				: 0);
	}

	return { indexed: totalIndexed, errors: totalErrors };
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
			...source,
			id: Number(source.id),
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
