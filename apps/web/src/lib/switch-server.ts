import { authClient } from "@/lib/auth-client";
import { QUERY_PERSIST_KEY } from "@/lib/offline";
import { setSwitchingServer } from "@/lib/switching-server-store";
import { client, queryClient } from "@/utils/orpc";

/** Tracks which server the persisted query cache belongs to (see dashboard-layout). */
export const ACTIVE_SERVER_KEY = "nanahoshi-active-server";

// Sections whose pages show a single server's catalog. A specific entity under
// them (a book, a series, …) won't exist after switching servers.
const CATALOG_SECTIONS = new Set([
	"books",
	"audiobooks",
	"authors",
	"narrators",
	"series",
	"genres",
	"publishers",
	"collections",
]);

/**
 * True when the path shows a single catalog entity (book detail, series page,
 * reader, …) that belongs to the active server. Such pages must be left on a
 * switch: the entity is missing in the new server, and books/reader would even
 * resolve the entity back into its old server (flipping the active org). List
 * and index pages instead just refetch under the new server, so we stay on them.
 */
export function isServerScopedDetailPath(pathname: string): boolean {
	const seg = pathname.split("/").filter(Boolean);
	if ((seg[0] === "reader" || seg[0] === "player") && seg.length >= 2) {
		return true;
	}
	if (seg[0] !== "dashboard" || !CATALOG_SECTIONS.has(seg[1] ?? ""))
		return false;
	// Audiobook series live one level deeper: /dashboard/audiobooks/series is the
	// (safe) list, /dashboard/audiobooks/series/:name is a detail page.
	if (seg[1] === "audiobooks" && seg[2] === "series") return seg.length >= 4;
	return seg.length >= 3;
}

/**
 * Reset every client cache so nothing from the previous server lingers, and
 * refetch what's on screen under the new server.
 *
 * Query keys are not server-scoped (the active server is server-side session
 * state), so a plain invalidate would leave inactive/persisted entries holding
 * the old server's data. `resetQueries()` clears every query back to its initial
 * state (no cross-server bleed) AND refetches the active (mounted) ones — unlike
 * `clear()`, which is a teardown that drops the cache without re-fetching, so
 * mounted observers keep showing the previous server's data.
 *
 * Returns the `resetQueries` promise so callers can keep a loading state up
 * until the active queries have refetched under the new server.
 */
export function resetClientCacheForServer(serverId: string | null) {
	// Drop the persisted snapshot too so a reload can't restore the old server.
	try {
		window.localStorage.removeItem(QUERY_PERSIST_KEY);
		window.localStorage.setItem(ACTIVE_SERVER_KEY, serverId ?? "");
	} catch {
		// no-op (private mode / storage disabled)
	}
	return queryClient.resetQueries();
}

/**
 * One-time mount reconciliation: if the persisted cache belongs to a different
 * server than the session's active one (e.g. it was switched on another device,
 * then this tab reloaded), hard-reset so we never show the wrong server's data.
 * The first run just records the server without discarding the freshly-loaded
 * cache (the loaders already fetched it under the correct server).
 */
export function reconcilePersistedServer(serverId: string | null) {
	const current = serverId ?? "";
	let stored: string | null;
	try {
		stored = window.localStorage.getItem(ACTIVE_SERVER_KEY);
	} catch {
		return;
	}
	if (stored === null) {
		try {
			window.localStorage.setItem(ACTIVE_SERVER_KEY, current);
		} catch {
			// no-op
		}
		return;
	}
	if (stored !== current) resetClientCacheForServer(serverId);
}

/**
 * Single source of truth for switching the active server (better-auth org).
 * Sets the active org, records it as the last-active server, optionally leaves
 * the current org-scoped page, then hard-resets the cache.
 *
 * Pass `navigateToDashboard` to leave an org-scoped resource page (e.g. a book
 * detail) behind first: it belongs to the previous server and would otherwise
 * show stale data or fire "not found" toasts as its queries refetch.
 */
export async function switchActiveServer(
	serverId: string | null,
	navigateToDashboard?: () => Promise<unknown> | unknown,
) {
	// Flag the switch up front so the dashboard covers the content immediately:
	// query keys aren't server-scoped, so until the cache resets the UI would
	// otherwise show the previous server's data during the setActive round-trip.
	setSwitchingServer(true);
	try {
		// Await setActive so the session's active org actually changes before we
		// refetch — otherwise queries reload under the previous server.
		await authClient.organization.setActive({ organizationId: serverId });
		client.users.setLastActiveOrg({ serverId }).catch(() => {});
		if (navigateToDashboard) await navigateToDashboard();
		// Await the refetch so the loader stays up until the new server's data is
		// ready, instead of revealing empty/loading state.
		await resetClientCacheForServer(serverId);
	} finally {
		setSwitchingServer(false);
	}
}
