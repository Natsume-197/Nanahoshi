// Drives the PWA <meta name="theme-color"> (the browser/OS navbar tint).
// The tag is created by the boot script in __root.tsx (not by HeadContent),
// so React never owns it and imperative updates here can't be clobbered.
// Colors pass through a probe element because browsers don't resolve
// var()/oklch() inside the meta tag itself.

const CHROME_COLOR = "var(--sidebar)";

let currentColor = CHROME_COLOR;

function resolveColor(color: string): string {
	const probe = document.createElement("div");
	probe.style.display = "none";
	probe.style.backgroundColor = color;
	document.body.appendChild(probe);
	const resolved = window.getComputedStyle(probe).backgroundColor;
	probe.remove();
	return resolved || color;
}

function apply() {
	if (typeof document === "undefined") return;
	let meta = document.querySelector<HTMLMetaElement>(
		'meta[name="theme-color"]',
	);
	if (!meta) {
		meta = document.createElement("meta");
		meta.name = "theme-color";
		document.head.appendChild(meta);
	}
	meta.content = resolveColor(currentColor);
}

/** Tint the browser chrome with an explicit color (e.g. the reader theme background). */
export function setThemeColor(color: string) {
	currentColor = color;
	apply();
}

/** Restore the app chrome color (--sidebar, the navbar/sidebar surface). */
export function resetThemeColor() {
	currentColor = CHROME_COLOR;
	apply();
}

/** Re-resolve the current color after `.dark` toggles on <html>. */
export function refreshThemeColor() {
	apply();
}
