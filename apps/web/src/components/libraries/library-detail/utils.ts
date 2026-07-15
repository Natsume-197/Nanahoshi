import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

/** Refetch the library list after any library mutation. */
export function invalidateLibraries() {
	queryClient.invalidateQueries({
		queryKey: orpc.libraries.getLibraries.queryOptions().queryKey,
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
