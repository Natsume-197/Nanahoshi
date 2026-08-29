import { useCallback } from "react";
import { clearOfflineCaches } from "@/lib/offline";

/** Clear user-owned client state and leave every authenticated surface. */
export function useCompleteSignOut() {
	return useCallback(async () => {
		await clearOfflineCaches();
		window.location.replace("/login");
	}, []);
}
