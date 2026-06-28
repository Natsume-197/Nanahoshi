import { metadataEnrichQueue } from "../infrastructure/queue/queues/metadata-enrich.queue";
import { enqueueSearchSync } from "../infrastructure/search/search-sync.service";
import { logger } from "../lib/logger";
import { bookRepository } from "../routers/books/book.repository";
import { bookMetadataRepository } from "../routers/books/metadata/metadata.repository";
import { extractPartMarker } from "../routers/books/metadata/providers/title-match";

// ─── Identifier validation ───────────────────────────────────────────────────
// Only validated ISBNs drive automatic grouping. This is the cheapest, most
// effective guard against the most common false-positive source: garbage ISBNs
// embedded in EPUBs (placeholders like 0000000000, malformed strings, etc.).

export function normalizeIsbn(s: string): string {
	return s.replace(/[\s-]/g, "").toUpperCase();
}

/** Rejects all-same-digit strings (0000000000, 9999999999, …). */
function isPlaceholderDigits(s: string): boolean {
	return /^(.)\1*$/.test(s);
}

export function isValidIsbn13(raw: string): boolean {
	const s = normalizeIsbn(raw);
	if (!/^\d{13}$/.test(s) || isPlaceholderDigits(s)) return false;
	let sum = 0;
	for (let i = 0; i < 12; i++) {
		sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
	}
	return (10 - (sum % 10)) % 10 === Number(s[12]);
}

export function isValidIsbn10(raw: string): boolean {
	const s = normalizeIsbn(raw);
	if (!/^\d{9}[\dX]$/.test(s) || isPlaceholderDigits(s)) return false;
	let sum = 0;
	for (let i = 0; i < 9; i++) {
		sum += Number(s[i]) * (10 - i);
	}
	sum += s[9] === "X" ? 10 : Number(s[9]);
	return sum % 11 === 0;
}

function validIsbnSet(meta: {
	isbn13: string | null;
	isbn10: string | null;
}): string[] {
	const out: string[] = [];
	if (meta.isbn13 && isValidIsbn13(meta.isbn13))
		out.push(normalizeIsbn(meta.isbn13));
	if (meta.isbn10 && isValidIsbn10(meta.isbn10))
		out.push(normalizeIsbn(meta.isbn10));
	return [...new Set(out)];
}

// Amazon ASIN — the only identifier Kindle-only editions carry (no ISBN). We
// match exclusively on the Kindle form (`B` + 9 alphanumerics): an ASIN that
// equals a print book's ISBN-10 is already covered by the ISBN path, and the
// `B` prefix keeps us clear of that ambiguity.
export function normalizeAsin(s: string): string {
	return s.trim().toUpperCase();
}

export function isValidAsin(raw: string): boolean {
	const s = normalizeAsin(raw);
	return /^B[0-9A-Z]{9}$/.test(s);
}

function validAsinSet(meta: { asin: string | null }): string[] {
	if (meta.asin && isValidAsin(meta.asin)) return [normalizeAsin(meta.asin)];
	return [];
}

// ─── Title veto (Japanese-aware) ─────────────────────────────────────────────
// The title is never a matching criterion — only a confirmation. After
// identifier candidates are found we drop any whose title is incompatible, so a
// valid-but-wrong identifier doesn't silently merge two different books. This
// matters most for ASINs: an Amazon fuzzy-search can hand the SAME ASIN to every
// volume of a series, so the veto is the only thing separating them.

// Publisher imprint / series label / bonus markers — noise that doesn't
// distinguish editions, and (worse) inflates similarity so the distinguishing
// part of the title stops mattering. Stripped before comparison. The negative
// lookahead keeps volume/part markers like （前）（上）（2） — those DISTINGUISH
// editions and must survive (NFKC has already folded full-width parens to ASCII).
const BOILERPLATE_RE =
	/「[^」]*」シリーズ|【[^】]*】|（(?![前後上中下\d])[^）]*）|\((?![前後上中下\d])[^)]*\)/g;

function stripBoilerplate(s: string): string {
	return s.normalize("NFKC").replace(BOILERPLATE_RE, "");
}

function normalizeTitle(s: string | null | undefined): string {
	if (!s) return "";
	// NFKC folds full-width↔half-width, ～, compat digits/katakana, etc.
	return stripBoilerplate(s)
		.toLowerCase()
		.replace(/[\s「」『』（）【】［\]():：・。、,.!?~'"]/g, "");
}

// ─── Edition discriminators ──────────────────────────────────────────────────
// A trailing volume number and a part marker (前/後/上/中/下) are the bits that
// tell two otherwise-identical titles apart (part marker via the shared
// extractPartMarker). When both sides carry one and they differ, the books are
// different editions — veto regardless of text similarity.

/** Trailing volume number after boilerplate is stripped (e.g. "…悪役令嬢。4"). */
function volumeNumber(s: string): number | null {
	const core = stripBoilerplate(s).replace(/\s+$/, "");
	const m = core.match(/(\d{1,3})\s*$/);
	return m ? Number(m[1]) : null;
}

/** Supplementary-product tag — a short-story/anthology/spin-off volume is a
 * different book from the main series, even though its title is a prefix-match.
 * SS needs a non-latin boundary so it doesn't fire inside words like "PASS". */
function supplementMarker(s: string): string {
	const t = s.normalize("NFKC").toLowerCase();
	return (
		t.match(/番外編|外伝|短編集|アンソロジー|ドラマcd/)?.[0] ??
		(/(?:^|[^a-z])ss(?:[^a-z]|$)/.test(t) ? "ss" : "")
	);
}

/** True when the two titles carry conflicting edition markers. A missing volume
 * number is treated as 1, so "…令嬢" (vol 1) never folds into "…令嬢2". */
function discriminatorsConflict(a: string, b: string): boolean {
	const pa = extractPartMarker(a);
	const pb = extractPartMarker(b);
	if (pa && pb && pa !== pb) return true;
	if (supplementMarker(a) !== supplementMarker(b)) return true;
	return (volumeNumber(a) ?? 1) !== (volumeNumber(b) ?? 1);
}

/** Character-bigram counts — no word tokenization, so it works for Japanese. */
function bigrams(s: string): Map<string, number> {
	const m = new Map<string, number>();
	for (let i = 0; i < s.length - 1; i++) {
		const g = s.slice(i, i + 2);
		m.set(g, (m.get(g) ?? 0) + 1);
	}
	return m;
}

/** Sørensen–Dice coefficient over character bigrams (0..1). */
function dice(a: string, b: string): number {
	if (a === b) return 1;
	if (a.length < 2 || b.length < 2) return 0;
	const ba = bigrams(a);
	const bb = bigrams(b);
	let overlap = 0;
	let total = 0;
	for (const v of ba.values()) total += v;
	for (const v of bb.values()) total += v;
	for (const [g, ca] of ba) {
		const cb = bb.get(g);
		if (cb) overlap += Math.min(ca, cb);
	}
	return (2 * overlap) / total;
}

function pairCompatible(a: string, b: string): boolean {
	if (!a || !b) return false;
	if (a === b) return true;
	if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)))
		return true;
	return dice(a, b) >= 0.8;
}

type TitlePair = { title: string | null; titleRomaji: string | null };

export function titlesCompatible(a: TitlePair, b: TitlePair): boolean {
	// Conflicting volume/part markers settle it — different editions, never merge.
	const ta = a.title ?? a.titleRomaji ?? "";
	const tb = b.title ?? b.titleRomaji ?? "";
	if (discriminatorsConflict(ta, tb)) return false;

	const at = normalizeTitle(a.title);
	const bt = normalizeTitle(b.title);
	if (at && bt && pairCompatible(at, bt)) return true;
	const ar = normalizeTitle(a.titleRomaji);
	const br = normalizeTitle(b.titleRomaji);
	if (ar && br && pairCompatible(ar, br)) return true;
	// Conservative: no usable title pair (or incompatible) → don't auto-group.
	return false;
}

// ─── Grouping ────────────────────────────────────────────────────────────────

type Member = { id: number; filesizeKb: number | null };

/** Canonical = largest file (NULLS LAST), tie-break smallest id. Caller must pass a non-empty array. */
function pickCanonical<T extends Member>(members: T[]): T {
	return [...members].sort((a, b) => {
		const fa = a.filesizeKb ?? -1;
		const fb = b.filesizeKb ?? -1;
		if (fb !== fa) return fb - fa;
		return a.id - b.id;
	})[0] as T;
}

/** Re-index the canonical and drop every hidden member from the search index. */
async function syncGroupChanges(
	canonicalId: number,
	hiddenIds: number[],
): Promise<void> {
	await Promise.all([
		enqueueSearchSync(canonicalId, "update"),
		...hiddenIds.map((id) => enqueueSearchSync(id, "delete")),
	]);
}

async function clearGroup(bookId: number): Promise<void> {
	// Re-expose the book as its own canonical. The sync runs unconditionally: a
	// promoted member's pointer may already have been NULLed by the FK
	// (ON DELETE SET NULL) when its canonical was deleted, so "no row updated"
	// does NOT mean "already indexed" — it must still be (re)indexed.
	await bookRepository.clearDuplicatePointerIfSet(bookId);
	await enqueueSearchSync(bookId, "update");
}

/**
 * Recomputes the duplicate group for `bookId` by validated ISBN within its
 * library, applying the title veto. Hides non-canonical members behind the
 * canonical (largest file) and re-exposes the canonical. Never touches
 * group_locked books (manual decisions win).
 */
export async function regroupBookDuplicates(bookId: number): Promise<void> {
	const row = await bookRepository.getGroupingInfo(bookId);
	if (!row || row.groupLocked) return;

	const isbns = validIsbnSet(row);
	const asins = validAsinSet(row);
	if (row.libraryId == null || (isbns.length === 0 && asins.length === 0)) {
		await clearGroup(bookId);
		return;
	}

	const candidates = await bookRepository.findGroupingCandidates(
		row.libraryId,
		{ isbns, asins },
	);

	// Keep the book itself plus candidates whose title is compatible with it.
	const subject: TitlePair = { title: row.title, titleRomaji: row.titleRomaji };
	const members = candidates.filter(
		(c) => c.id === bookId || titlesCompatible(subject, c),
	);

	if (members.length <= 1) {
		await clearGroup(bookId);
		return;
	}

	const canonical = pickCanonical(members);
	const toCanonical: number[] = [];
	const toHidden: number[] = [];
	for (const m of members) {
		if (m.id === canonical.id) {
			if (m.duplicateOfBookId !== null) toCanonical.push(m.id);
		} else if (m.duplicateOfBookId !== canonical.id) {
			toHidden.push(m.id);
		}
	}

	await bookRepository.clearDuplicatePointers(toCanonical);
	await bookRepository.setDuplicateOf(toHidden, canonical.id);

	await syncGroupChanges(canonical.id, toHidden);
}

/**
 * Largest non-locked member currently hidden behind `canonicalId`. Call this
 * BEFORE deleting the canonical: the FK `set null` then clears the pointers.
 */
export async function findMemberToPromote(
	canonicalId: number,
): Promise<{ id: number; uuid: string } | null> {
	const members = await bookRepository.listHiddenMembers(canonicalId);
	if (members.length === 0) return null;
	const top = pickCanonical(members);
	return { id: top.id, uuid: top.uuid };
}

/**
 * Manual, explicit grouping. Does not require ISBNs or pass the title veto, so
 * it can group editions the automation can't detect (e.g. ASIN-only). Absorbs
 * any existing hidden members of the selected books to avoid nested chains.
 */
export async function groupAsEditions(
	bookIds: number[],
): Promise<{ canonicalId: number } | null> {
	const unique = [...new Set(bookIds)];
	if (unique.length < 2) return null;

	const selected = await bookRepository.listByIdsWithSize(unique);
	if (selected.length < 2) return null;

	const canonical = pickCanonical(selected);
	const memberRows = await bookRepository.listGroupMemberIds(unique);
	const hidden = memberRows
		.map((r) => r.id)
		.filter((id) => id !== canonical.id);

	await bookRepository.lockAsCanonical(canonical.id);
	await bookRepository.lockAsHidden(hidden, canonical.id);

	await syncGroupChanges(canonical.id, hidden);
	return { canonicalId: canonical.id };
}

/**
 * Manual detach. Marks the book as its own canonical and locks it so a rescan
 * won't re-merge it. Since hidden copies aren't enriched, kick off enrichment
 * now that it's its own source of truth.
 */
export async function ungroupEdition(bookId: number): Promise<void> {
	await bookRepository.lockAsCanonical(bookId);
	await enqueueSearchSync(bookId, "update");

	const uuid = await bookRepository.getUuid(bookId);
	if (uuid && !(await bookMetadataRepository.isAmazonEnriched(bookId))) {
		await enqueueBookEnrich(bookId, uuid).catch((err) =>
			logger.error({ err }, `[Grouping] enrich enqueue failed for ${bookId}`),
		);
	}
}

/**
 * Enrich a single ebook that just became its own source of truth (promotion /
 * ungroup). Incidental work, so it carries no taskId and isn't counted.
 */
export async function enqueueBookEnrich(
	bookId: number,
	uuid: string,
): Promise<void> {
	await metadataEnrichQueue.add(
		"enrich-book",
		{ bookId, uuid },
		{
			removeOnComplete: { age: 60 },
			removeOnFail: { count: 100 },
			priority: 10,
			attempts: 3,
			backoff: { type: "exponential", delay: 60_000 },
		},
	);
}
