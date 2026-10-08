import { StandardRPCJsonSerializer } from "@orpc/client/standard";
import {
	type DehydratedState,
	dehydrate,
	hydrate,
	type Query,
	type QueryClient,
} from "@tanstack/react-query";

const VERSION = 1;
/** Older than this, a saved answer is more misleading than a skeleton. */
export const SNAPSHOT_MAX_AGE = 7 * 24 * 60 * 60_000;

/** The screens a cold start shows, not a week of every detail page touched:
 * the cache only grows (24 h gcTime) and the whole file is rewritten. */
export const SNAPSHOT_MAX_QUERIES = 120;

const serializer = new StandardRPCJsonSerializer();

type Snapshot = { version: number; json: unknown; meta: unknown };

type InfiniteData = { pages: unknown[]; pageParams: unknown[] };

const isInfinite = (data: unknown): data is InfiniteData =>
	!!data &&
	typeof data === "object" &&
	Array.isArray((data as InfiniteData).pages) &&
	Array.isArray((data as InfiniteData).pageParams);

/** Only the server's answers (oRPC keys start with the procedure path);
 * hand-keyed queries hold files, searches or images. */
export const shouldSnapshot = (query: Query) =>
	query.state.status === "success" && Array.isArray(query.queryKey[0]);

/**
 * The cache as text, so a cold start can draw the last screens it saw while
 * the server answers again. oRPC's serializer keeps Dates as Dates; an
 * infinite list keeps its first page only (a restore would refetch them all).
 */
export function serializeQueries(client: QueryClient): string | null {
	const kept = pickForSnapshot(client.getQueryCache().getAll());
	const state = dehydrate(client, {
		shouldDehydrateQuery: (query) => kept.has(query),
	});
	const queries = state.queries.map((query) =>
		isInfinite(query.state.data)
			? {
					...query,
					state: {
						...query.state,
						data: {
							pages: query.state.data.pages.slice(0, 1),
							pageParams: query.state.data.pageParams.slice(0, 1),
						},
					},
				}
			: query,
	);
	const [json, meta, maps] = serializer.serialize({ mutations: [], queries });
	if (maps.length > 0) return null;
	return JSON.stringify({ version: VERSION, json, meta } satisfies Snapshot);
}

/** What is on screen first, then the most recently answered, up to the cap. */
function pickForSnapshot(queries: Query[]): Set<Query> {
	const ranked = queries
		.filter(shouldSnapshot)
		.sort(
			(a, b) =>
				Number(b.getObserversCount() > 0) - Number(a.getObserversCount() > 0) ||
				b.state.dataUpdatedAt - a.state.dataUpdatedAt,
		);
	return new Set(ranked.slice(0, SNAPSHOT_MAX_QUERIES));
}

export function restoreQueries(
	client: QueryClient,
	text: string,
	now = Date.now(),
) {
	const snapshot = JSON.parse(text) as Snapshot;
	if (snapshot.version !== VERSION) return;
	const state = serializer.deserialize(
		snapshot.json as never,
		snapshot.meta as never,
	) as DehydratedState;
	hydrate(client, {
		mutations: [],
		queries: state.queries.filter(
			(query) => now - query.state.dataUpdatedAt < SNAPSHOT_MAX_AGE,
		),
	});
}
