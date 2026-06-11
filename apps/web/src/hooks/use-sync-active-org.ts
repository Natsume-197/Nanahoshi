import { authClient } from "@/lib/auth-client";
import { client, queryClient } from "@/utils/orpc";
import { useMountEffect } from "./use-mount-effect";

/**
 * Syncs the client-side active organization when a book loader resolved the
 * book in an org other than the active one (e.g. opening a shared book URL for
 * a book in another org you belong to). The server already returned the book
 * scoped to that org; this refreshes better-auth's session cookie cache and
 * reactive store so the rest of the UI (org switcher, recents, ambient bloom)
 * follows along.
 *
 * Mount-only on purpose: the dominant case is a fresh navigation/URL open,
 * which mounts the route. The loader always re-resolves the book, so the page
 * itself stays correct even if a same-route book→book switch doesn't remount.
 */
export function useSyncActiveOrg(switchedOrgId: string | null | undefined) {
	useMountEffect(() => {
		if (!switchedOrgId) return;
		void (async () => {
			await authClient.organization.setActive({
				organizationId: switchedOrgId,
			});
			client.users
				.setLastActiveOrg({ organizationId: switchedOrgId })
				.catch(() => {});
			await queryClient.invalidateQueries();
		})();
	});
}
