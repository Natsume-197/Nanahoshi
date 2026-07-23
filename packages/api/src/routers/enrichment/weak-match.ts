import { CATALOG_IDENTITY_REASONS as R } from "../../modules/catalogIdentity/types";

// A hard identifier — ISBN, ASIN, or the EPUB's embedded uid — pins the match
// to an exact edition. The book identity gate confirms everything else on
// softer evidence (matching title + author), which is usually right but can
// land on the wrong volume or a same-titled, same-author work.
const HARD_IDENTIFIER_REASONS: readonly string[] = [
	R.IDENTIFIER_MATCH,
	R.EMBEDDED_UID_MATCH,
	R.AUDIO_ASIN_MATCH,
];

/**
 * True when a confirmed match rests on soft evidence alone (title + author, no
 * ISBN/ASIN/uid). These are worth a human glance, so they land in the "review"
 * queue instead of silently counting as "enriched". Applied to ebooks only —
 * audiobooks routinely match without an identifier, so review there is noise.
 */
export function isWeakIdentityMatch(
	primaryReasons: readonly string[],
): boolean {
	if (primaryReasons.length === 0) return false;
	return !primaryReasons.some((reason) =>
		HARD_IDENTIFIER_REASONS.includes(reason),
	);
}
