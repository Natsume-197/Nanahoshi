import { createContext, useContext } from "react";
import type {
	OrgSettingsIntent,
	OrgSettingsSection,
} from "@/components/settings/server-settings-modal";
import type { SettingsSection } from "@/components/settings/settings-sections";

type SettingsModalControls = {
	openSettings: (section: SettingsSection) => void;
	closeSettings: () => void;
	/** `intent` deep-links into a section action (e.g. open the create-library
	 * wizard straight away) instead of just landing on the section. */
	openOrgSettings: (
		section: OrgSettingsSection,
		intent?: OrgSettingsIntent,
	) => void;
};

const SettingsModalContext = createContext<SettingsModalControls | null>(null);

export const SettingsModalProvider = SettingsModalContext.Provider;

/** Controls account or server settings from anywhere in the app. */
export function useSettingsModal(): SettingsModalControls {
	const ctx = useContext(SettingsModalContext);
	if (!ctx) {
		throw new Error("useSettingsModal must be used within a SettingsModalHost");
	}
	return ctx;
}
