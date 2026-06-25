import { createContext, useContext } from "react";
import type { OrgSettingsSection } from "@/components/settings/server-settings-modal";
import type { SettingsSection } from "@/components/settings/settings-sections";

type SettingsModalControls = {
	openSettings: (section: SettingsSection) => void;
	openOrgSettings: (section: OrgSettingsSection) => void;
};

const SettingsModalContext = createContext<SettingsModalControls | null>(null);

export const SettingsModalProvider = SettingsModalContext.Provider;

/** Opens the settings / org-settings modals from anywhere under the dashboard. */
export function useSettingsModal(): SettingsModalControls {
	const ctx = useContext(SettingsModalContext);
	if (!ctx) {
		throw new Error(
			"useSettingsModal must be used within the dashboard layout",
		);
	}
	return ctx;
}
