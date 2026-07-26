import { CATALOG_IDENTITY_REASONS as R } from "../catalogIdentity/types";

// A hard identifier — ISBN, ASIN, or the EPUB's embedded uid — pins the match
// to an exact edition, so it never needs a second opinion.
const HARD_IDENTIFIER_REASONS: readonly string[] = [
	R.IDENTIFIER_MATCH,
	R.EMBEDDED_UID_MATCH,
	R.AUDIO_ASIN_MATCH,
];

/**
 * True when a Confirmed verdict is a Provisional Match — enriched now, awaiting
 * human confirmation.
 *
 * Corroborating Evidence puts a compatible author on equal footing with a
 * matching identifier, so "no ISBN/ASIN" is not by itself a reason to supervise
 * a match; treating it as one sends whole libraries to the queue (Japanese
 * light-novel EPUBs basically never carry an identifier) and makes the queue
 * meaningless.
 *
 * What is left is the judgement calls:
 *   - the Compatible Title was strongly similar rather than equivalent, which
 *     can bridge two different Logical Editions (a spin-off, a side story);
 *   - the pipeline could equally confirm another candidate, so Candidate
 *     Ranking alone decided the winner — but only when the winner's own
 *     evidence is soft. A series numbered plainly ("SERIES 2") makes every
 *     sibling volume and side-arc look like a rival at discovery time, so
 *     letting a rival override an equivalent title plus a compatible author
 *     queues whole series for review over a packaging convention.
 *
 * Applied to written books only — Audiobook Quick Match selects under its own
 * Audiobookshelf-compatible policy and supervision there is noise.
 */
export function isProvisionalMatch(
	primaryReasons: readonly string[],
	{ ambiguous = false }: { ambiguous?: boolean } = {},
): boolean {
	if (primaryReasons.length === 0) return false;
	if (primaryReasons.some((reason) => HARD_IDENTIFIER_REASONS.includes(reason)))
		return false;
	const equivalent = primaryReasons.includes(R.TITLE_EQUIVALENT);
	if (equivalent && primaryReasons.includes(R.AUTHOR_MATCH)) return false;
	if (ambiguous) return true;
	return !equivalent;
}
