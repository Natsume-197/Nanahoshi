import { orpc, queryClient } from "@/utils/orpc";

/** Refetch the library list after any library mutation. */
export function invalidateLibraries() {
	queryClient.invalidateQueries({
		queryKey: orpc.libraries.getLibraries.queryOptions().queryKey,
	});
}

/** Scheduled-scan frequency choices, stored as minutes. */
export const SCAN_INTERVAL_OPTIONS = [
	{ value: 360, label: "Every 6 hours" },
	{ value: 720, label: "Every 12 hours" },
	{ value: 1440, label: "Daily" },
	{ value: 10080, label: "Weekly" },
] as const;

export const DEFAULT_SCAN_INTERVAL = 1440;
