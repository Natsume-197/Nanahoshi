// Corner radius is an appearance setting in its own right, not part of a
// palette: it survives theme switches and needs no custom theme. Unset falls
// back to the stylesheet's per-theme default (0.5rem light, 0.2rem dark).

const STORAGE_KEY = "theme-radius";

export const RADIUS_MIN = 0;
export const RADIUS_MAX = 1.2;
export const RADIUS_STEP = 0.05;

function clamp(value: number): number {
	return Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, value));
}

/** The stored override, or null when the theme default should win. */
export function getStoredRadius(): number | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (raw === null) return null;
		const parsed = Number.parseFloat(raw);
		return Number.isFinite(parsed) ? clamp(parsed) : null;
	} catch {
		return null;
	}
}

export function storeRadius(radius: number | null) {
	if (typeof window === "undefined") return;
	try {
		if (radius === null) window.localStorage.removeItem(STORAGE_KEY);
		else window.localStorage.setItem(STORAGE_KEY, String(clamp(radius)));
	} catch {
		// Storage full/blocked — the radius still applies for this session.
	}
}

/** Write the override onto <html>, or remove it to fall back to the theme. */
export function applyRadius(radius: number | null) {
	if (typeof document === "undefined") return;
	const style = document.documentElement.style;
	if (radius === null) style.removeProperty("--radius");
	else style.setProperty("--radius", `${clamp(radius)}rem`);
}

/**
 * The radius currently in effect, override or not — the slider needs a real
 * starting value even when nothing is stored.
 */
export function readEffectiveRadius(fallback = 0.5): number {
	if (typeof document === "undefined") return fallback;
	const raw = getComputedStyle(document.documentElement)
		.getPropertyValue("--radius")
		.trim();
	const parsed = Number.parseFloat(raw);
	return Number.isFinite(parsed) ? clamp(parsed) : fallback;
}
