import { isNewerVersion } from "@nanahoshi/api/modules/updates/version";
import { useGatewayChannel } from "@/lib/gateway/use-gateway-channel";
import { orpc, queryClient } from "@/utils/orpc";

/** The running release and any planned restart, for every signed-in person. */
export const updateNoticeQuery = () =>
	orpc.updates.notice.queryOptions({
		refetchOnWindowFocus: true,
		// The gateway pushes changes; this only covers a missed one.
		refetchInterval: 5 * 60_000,
	});

export const BUNDLE_RELEASE: string =
	import.meta.env.VITE_NANAHOSHI_RELEASE ?? "development";

function invalidateUpdates() {
	void queryClient.invalidateQueries({ queryKey: orpc.updates.key() });
}

/**
 * Refetch update state whenever the server says it changed, and on every
 * (re)connect: a server that just restarted into a new release is noticed as
 * soon as the socket comes back.
 */
export function useUpdateEvents() {
	useGatewayChannel("updates", invalidateUpdates, invalidateUpdates);
}

/**
 * The server now runs a newer release than this page was built from: it was
 * updated while the page stayed open.
 */
export function needsReload(serverRelease: string | undefined) {
	return !!serverRelease && isNewerVersion(serverRelease, BUNDLE_RELEASE);
}
