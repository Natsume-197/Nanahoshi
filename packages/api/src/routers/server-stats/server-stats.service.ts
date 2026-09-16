import { TtlPromiseCache } from "../../lib/ttl-promise-cache";
import { serverStatsRepository } from "./server-stats.repository";

type ServerStats = Awaited<ReturnType<typeof serverStatsRepository.getStats>>;

/**
 * Short-TTL cache for the settings Stats section. The underlying aggregation
 * scans `book` per library, so recomputing it on every settings visit is
 * wasteful: stats only change on scan/import/delete granularity. Staleness
 * contract: numbers may lag writes by up to the TTL below.
 */
const statsCache = new TtlPromiseCache<ServerStats>(30_000, 200);

export function getCachedStats(serverId: string): Promise<ServerStats> {
	return statsCache.get(serverId, () =>
		serverStatsRepository.getStats(serverId),
	);
}

/** Test hook: drop all cached entries so the next call re-queries. */
export function clearServerStatsCache(): void {
	statsCache.clear();
}
