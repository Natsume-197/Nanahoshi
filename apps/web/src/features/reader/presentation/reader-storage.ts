export const READER_STORAGE_KEYS = {
	settings: "nanahoshi-reader-settings",
	manualReadingPoints: "nanahoshi-manual-reading-points",
	customThemes: "nanahoshi-reader-custom-themes",
	profiles: "nanahoshi-reader-profiles",
	activeProfile: "nanahoshi-reader-active-profile",
	profilesMeta: "nanahoshi-reader-profiles-meta",
	themesMeta: "nanahoshi-reader-custom-themes-meta",
	visualSettings: "nanahoshi-visual-reader-settings",
	presentationPreferences: "nanahoshi-reader-mode-preferences",
} as const;

const OWNER_KEY = "nanahoshi-reader-storage-owner";

export function getReaderStorageOwner(): string | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(OWNER_KEY);
	} catch {
		return null;
	}
}

/**
 * Claims legacy, unscoped reader storage for the current user. If the browser
 * has since authenticated as somebody else, remove every user-owned reader
 * preference before any settings state is initialized.
 */
export function prepareReaderStorage(userId: string): void {
	if (typeof window === "undefined") return;
	try {
		const owner = window.localStorage.getItem(OWNER_KEY);
		if (owner && owner !== userId) clearReaderStorage();
		window.localStorage.setItem(OWNER_KEY, userId);
	} catch {
		// Private storage may reject reads or writes; settings remain in memory.
	}
}

/** Clears all local reader preferences and their account ownership marker. */
export function clearReaderStorage(): void {
	if (typeof window === "undefined") return;
	try {
		for (const key of Object.values(READER_STORAGE_KEYS)) {
			window.localStorage.removeItem(key);
		}
		window.localStorage.removeItem(OWNER_KEY);
	} catch {
		// Private storage may reject writes.
	}
}
