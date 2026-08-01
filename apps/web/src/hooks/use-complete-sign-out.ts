import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import { clearOfflineCaches } from "@/lib/offline";
import { queryClient } from "@/utils/orpc";

/** Clear user-owned client state and leave every authenticated surface. */
export function useCompleteSignOut() {
	const navigate = useNavigate();
	const router = useRouter();
	const { closeSettings } = useSettingsModal();

	return useCallback(async () => {
		closeSettings();
		queryClient.removeQueries({ queryKey: ["auth", "session"] });
		queryClient.clear();
		await clearOfflineCaches();
		await router.invalidate();
		await navigate({ to: "/login" });
	}, [closeSettings, navigate, router]);
}
