import { lazy, Suspense, useMemo, useState } from "react";
import { SettingsModalProvider } from "@/components/layout/settings-modal-context";
import type { OrgSettingsSection } from "@/components/settings/server-settings-modal";
import type { SettingsSection } from "@/components/settings/settings-sections";

const SettingsModal = lazy(async () => {
	const module = await import("@/components/settings/settings-modal");
	return { default: module.SettingsModal };
});

const ServerSettingsModal = lazy(async () => {
	const module = await import("@/components/settings/server-settings-modal");
	return { default: module.ServerSettingsModal };
});

export function preloadSettingsModal() {
	void import("@/components/settings/settings-modal");
}

/**
 * Owns the settings / server-settings modal open state and renders the modals.
 * Mounted above the locale-keyed subtree in __root so a language switch (which
 * remounts the routed tree) re-renders the modals in the new language without
 * closing them — while `useSettingsModal()` stays available across the app.
 */
export function SettingsModalHost({ children }: { children: React.ReactNode }) {
	const [activeSettings, setActiveSettings] = useState<SettingsSection | null>(
		null,
	);
	const [activeOrgSettings, setActiveOrgSettings] =
		useState<OrgSettingsSection | null>(null);

	const controls = useMemo(
		() => ({
			openSettings: (section: SettingsSection) => setActiveSettings(section),
			openOrgSettings: (section: OrgSettingsSection) =>
				setActiveOrgSettings(section),
		}),
		[],
	);

	return (
		<SettingsModalProvider value={controls}>
			{children}

			{activeSettings && (
				<Suspense fallback={null}>
					<SettingsModal
						section={activeSettings}
						onNavigate={setActiveSettings}
						onClose={() => setActiveSettings(null)}
					/>
				</Suspense>
			)}

			{activeOrgSettings && (
				<Suspense fallback={null}>
					<ServerSettingsModal
						section={activeOrgSettings}
						onNavigate={setActiveOrgSettings}
						onClose={() => setActiveOrgSettings(null)}
					/>
				</Suspense>
			)}
		</SettingsModalProvider>
	);
}
