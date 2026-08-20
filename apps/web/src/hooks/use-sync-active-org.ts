import { toast } from "sonner";
import { switchActiveServer } from "@/lib/switch-server";
import { m } from "@/paraglide/messages";
import { useMountEffect } from "./use-mount-effect";

/**
 * Syncs the client-side active server when a book loader resolved the
 * book in an org other than the active one (e.g. opening a shared book URL for
 * a book in another org you belong to). The server already returned the book
 * scoped to that org; this refreshes better-auth's session cookie cache and
 * reactive store so the rest of the UI (org switcher, recents) follows along.
 *
 * Mount-only on purpose: the dominant case is a fresh navigation/URL open,
 * which mounts the route. The loader always re-resolves the book, so the page
 * itself stays correct even if a same-route book→book switch doesn't remount.
 */
export function useSyncActiveOrg(switchedOrgId: string | null | undefined) {
	useMountEffect(() => {
		if (!switchedOrgId) return;
		// No navigate: the book page already resolved this book under the new org;
		// switching just realigns the session + cache so the rest of the UI follows.
		void switchActiveServer(switchedOrgId).catch((error) =>
			toast.error(
				error instanceof Error
					? error.message
					: m["toast.switch_server_failed"](),
			),
		);
	});
}
