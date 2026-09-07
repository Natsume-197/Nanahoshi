import { useRouter } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { SettingsModalProvider } from "@/components/layout/settings-modal-context";
import type {
	OrgSettingsIntent,
	OrgSettingsSection,
} from "@/components/settings/server-settings-modal";
import type { SettingsSection } from "@/components/settings/settings-sections";

const ServerSettingsModal = lazy(async () => {
	const module = await import("@/components/settings/server-settings-modal");
	return { default: module.ServerSettingsModal };
});

export function preloadSettingsPage() {
	void import("@/components/settings/settings-page");
}

/**
 * Routes personal settings and owns the server-settings modal state.
 * Mounted above the locale-keyed subtree in __root so a language switch (which
 * remounts the routed tree) re-renders the modals in the new language without
 * closing them — while `useSettingsModal()` stays available across the app.
 */
export function SettingsModalHost({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const [activeOrgSettings, setActiveOrgSettings] = useState<{
		section: OrgSettingsSection;
		intent?: OrgSettingsIntent;
	} | null>(null);

	const controls = useMemo(
		() => ({
			openSettings: (section: SettingsSection) => {
				setActiveOrgSettings(null);
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
				setActiveOrgSettings({ section, intent });
			},
		}),
		[router],
	);

	return (
		<SettingsModalProvider value={controls}>
			{children}

			{activeOrgSettings && (
				<Suspense fallback={null}>
					<ServerSettingsModal
						section={activeOrgSettings.section}
						intent={activeOrgSettings.intent}
						// Navigating within the modal consumes the deep-link intent so
						// leaving and returning to a section doesn't re-fire its action.
						onNavigate={(section) => setActiveOrgSettings({ section })}
						onClose={() => setActiveOrgSettings(null)}
					/>
				</Suspense>
			)}
		</SettingsModalProvider>
	);
}
