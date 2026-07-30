import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

/** Refetch the library list after any library mutation. */
export function invalidateLibraries() {
	queryClient.invalidateQueries({
		queryKey: orpc.libraries.getLibraries.queryOptions().queryKey,
	});
	// Adding, removing or toggling a folder changes which folders exist, so the
	// cached health verdicts describe a folder set that no longer matches.
	queryClient.invalidateQueries({
		queryKey: orpc.libraries.getLibraryPathHealth.key(),
	});
	queryClient.invalidateQueries({
		queryKey: orpc.libraries.getLibrariesOverview.queryOptions().queryKey,
	});
}

/** Scheduled-scan frequency choices, stored as minutes. Labels are functions
 * so they resolve in the viewer's locale at render time. */
export const SCAN_INTERVAL_OPTIONS = [
	{ value: 360, label: () => m["library.interval_6h"]() },
	{ value: 720, label: () => m["library.interval_12h"]() },
	{ value: 1440, label: () => m["library.interval_daily"]() },
	{ value: 10080, label: () => m["library.interval_weekly"]() },
] as const;

export const DEFAULT_SCAN_INTERVAL = 1440;

/** Names a folder probe verdict; the fix differs per state, so don't merge them. */
export function folderStateLabel(state: string): string {
	switch (state) {
		case "missing":
			return m["library.folder_state_missing"]();
		case "unreadable":
			return m["library.folder_state_unreadable"]();
		case "not_a_directory":
			return m["library.folder_state_not_a_directory"]();
		case "timeout":
			return m["library.folder_state_timeout"]();
		default:
			return m["library.folder_state_ok"]();
	}
}
