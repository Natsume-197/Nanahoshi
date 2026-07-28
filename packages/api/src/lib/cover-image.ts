/**
 * Shared rules for cover art we persist to disk.
 *
 * Ebook covers are stored as the provider's original bytes; audiobook covers go
 * through sharp because they can arrive as multi-megabyte embedded art. Both end
 * up in the same `data/covers` directory and are served by the same resize
 * route, so the stored file is the hard ceiling on how sharp a cover can ever
 * look — the serve-time encoder can only lose detail, never invent it.
 */

/** Comfortably above the largest slot any layout requests (detail at 3x DPR). */
export const COVER_STORE_MAX_DIM = 1600;

/**
 * Near-transparent, because this is a *generational* encode: the serve-time
 * route re-encodes from this file, so artifacts introduced here are permanent
 * and compound.
 */
export const COVER_STORE_QUALITY = 90;

/**
 * Amazon's image CDN encodes the rendition in the filename
 * (`...._SL500_.jpg`), and Audnexus hands us the 500px one. Asking for a larger
 * rendition returns the native size when the source is smaller, so this only
 * ever gains pixels. URLs with no modifier are already full-size.
 */
export function upgradeAmazonImageUrl(url: string): string {
	return url.replace(
		/\._(?:SL|SX|SY|SS|UX|UY|CR|AC)([\d,]*)_\./,
		(match, dims: string) => {
			const largest = Math.max(
				0,
				...dims
					.split(",")
					.map(Number)
					.filter((n) => Number.isFinite(n)),
			);
			// Only ever widen: a URL already asking for more than we store would
			// lose pixels if we rewrote it down to our own ceiling.
			return largest >= COVER_STORE_MAX_DIM
				? match
				: `._SL${COVER_STORE_MAX_DIM}_.`;
		},
	);
}
