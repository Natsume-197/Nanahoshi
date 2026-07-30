const HEADER_STANDARD_WIDTH = 1500;
// avif for current uploads, webp for headers stored before the AVIF migration.
const HEADER_VARIANT_PATTERN = /^(.*-)(\d+)w(\.(?:avif|webp)(?:[?#].*)?)$/;

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
