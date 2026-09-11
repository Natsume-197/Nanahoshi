import { useRouter } from "@tanstack/react-router";
import { useMemo } from "react";
import { SettingsModalProvider } from "@/components/layout/settings-modal-context";
import type {
	OrgSettingsIntent,
	OrgSettingsSection,
	SettingsSection,
} from "@/components/settings/settings-sections";

export function preloadSettingsPage() {
	void import("@/components/settings/settings-page");
	void import("@/components/settings/server-settings-page");
}

/**
 * Routes personal settings and server settings to their dedicated pages.
 * Mounted above the locale-keyed subtree in __root so a language switch (which
 * remounts the routed tree) keeps `useSettingsModal()` available across the app.
 */
export function SettingsModalHost({ children }: { children: React.ReactNode }) {
	const router = useRouter();

	const controls = useMemo(
		() => ({
			openSettings: (section: SettingsSection) => {
				void router.navigate({
					to: "/dashboard/settings/$section",
					params: { section },
				});
			},
			closeSettings: () => void router.navigate({ to: "/dashboard" }),
			openOrgSettings: (
				section: OrgSettingsSection,
				intent?: OrgSettingsIntent,
			) => {
				void router.navigate({
					to: "/dashboard/server/$section",
					params: { section },
					search: intent ? { intent } : {},
				});
			},
		}),
		[router],
	);

	return (
		<SettingsModalProvider value={controls}>{children}</SettingsModalProvider>
	);
}
