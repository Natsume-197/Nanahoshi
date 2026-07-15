const HEADER_STANDARD_WIDTH = 1500;
const HEADER_VARIANT_PATTERN = /^(.*-)(\d+)w(\.webp(?:[?#].*)?)$/;

type HeaderImageSources = {
	src: string;
	srcSet?: string;
	sizes?: string;
};

/**
 * Builds responsive sources for profile headers created by the media service.
 * Legacy header URLs remain valid and simply fall back to their stored file.
 */
export function getHeaderImageSources(url: string): HeaderImageSources {
	const match = url.match(HEADER_VARIANT_PATTERN);
	if (!match) return { src: url };

	const [, prefix, widthValue, suffix] = match;
	const width = Number(widthValue);
	if (
		!prefix ||
		!suffix ||
		!Number.isFinite(width) ||
		width <= HEADER_STANDARD_WIDTH
	) {
		return { src: url };
	}

	const standardUrl = `${prefix}${HEADER_STANDARD_WIDTH}w${suffix}`;
	return {
		src: url,
		srcSet: `${standardUrl} ${HEADER_STANDARD_WIDTH}w, ${url} ${width}w`,
		sizes: "100vw",
	};
}

/** Uses the lighter standard variant in small settings previews when available. */
export function getHeaderPreviewUrl(url: string): string {
	const sources = getHeaderImageSources(url);
	return sources.srcSet?.split(" ")[0] ?? sources.src;
}

// Curated banner colors offered in settings. The stored value is a plain hex
// so the server only needs to validate the format.
export const PROFILE_COLORS = [
	"#5865f2", // blurple
	"#3b82f6", // blue
	"#06b6d4", // cyan
	"#10b981", // emerald
	"#f59e0b", // amber
	"#f97316", // orange
	"#ef4444", // red
	"#ec4899", // pink
	"#a855f7", // purple
	"#64748b", // slate
] as const;

export function getProfileBannerGradient(color: string): string {
	return `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 68%, black))`;
}
