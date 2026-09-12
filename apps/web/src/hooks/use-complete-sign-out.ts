import { useCallback } from "react";
import { clearOfflineCaches } from "@/lib/offline";
import { posthog } from "@/lib/posthog";

/** Clear user-owned client state and leave every authenticated surface. */
export function useCompleteSignOut() {
	return useCallback(async () => {
		posthog?.reset();
		await clearOfflineCaches();
		window.location.replace("/login");
	}, []);
}
