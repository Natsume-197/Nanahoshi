import { db } from "@nanahoshi-v2/db";
import { book, bookMetadata } from "@nanahoshi-v2/db/schema/general";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { metadataEnrichQueue } from "../infrastructure/queue/queues/metadata-enrich.queue";
import { enqueueSearchSync } from "../infrastructure/search/search-sync.service";
import { logger } from "../lib/logger";
import { bookMetadataRepository } from "../routers/books/metadata/metadata.repository";
import { getOrCreateAutoEnrichTask, incrementTotalJobs } from "./taskManager";

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

// ─── Title veto (Japanese-aware) ─────────────────────────────────────────────
// The title is never a matching criterion — only a confirmation. After ISBN
// candidates are found we drop any whose title is incompatible, so a valid but
// wrongly-assigned ISBN doesn't silently merge two different books.

function normalizeTitle(s: string | null | undefined): string {
	if (!s) return "";
	// NFKC folds full-width↔half-width, ～, compat digits/katakana, etc.
	return s
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[\s「」『』（）【】［\]():：・。、,.!?~'"]/g, "");
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

/** SQL-normalized ISBN column (mirrors normalizeIsbn). */
function normIsbnSql(
	col: typeof bookMetadata.isbn13 | typeof bookMetadata.isbn10,
) {
	return sql`upper(replace(replace(coalesce(${col}, ''), '-', ''), ' ', ''))`;
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
	await db
		.update(book)
		.set({ duplicateOfBookId: null })
		.where(and(eq(book.id, bookId), isNotNull(book.duplicateOfBookId)));
	await enqueueSearchSync(bookId, "update");
}

/**
 * Recomputes the duplicate group for `bookId` by validated ISBN within its
 * library, applying the title veto. Hides non-canonical members behind the
 * canonical (largest file) and re-exposes the canonical. Never touches
 * group_locked books (manual decisions win).
 */
export async function regroupBookDuplicates(bookId: number): Promise<void> {
	const [row] = await db
		.select({
			libraryId: book.libraryId,
			groupLocked: book.groupLocked,
			title: bookMetadata.title,
			titleRomaji: bookMetadata.titleRomaji,
			isbn13: bookMetadata.isbn13,
			isbn10: bookMetadata.isbn10,
		})
		.from(book)
		.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
		.where(eq(book.id, bookId))
		.limit(1);
	if (!row || row.groupLocked) return;

	const isbns = validIsbnSet(row);
	if (row.libraryId == null || isbns.length === 0) {
		await clearGroup(bookId);
		return;
	}

	const isbnList = sql.join(
		isbns.map((v) => sql`${v}`),
		sql`, `,
	);
	const candidates = await db
		.select({
			id: book.id,
			filesizeKb: book.filesizeKb,
			duplicateOfBookId: book.duplicateOfBookId,
			title: bookMetadata.title,
			titleRomaji: bookMetadata.titleRomaji,
		})
		.from(book)
		.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
		.where(
			and(
				eq(book.libraryId, row.libraryId),
				eq(book.groupLocked, false),
				or(
					sql`${normIsbnSql(bookMetadata.isbn13)} IN (${isbnList})`,
					sql`${normIsbnSql(bookMetadata.isbn10)} IN (${isbnList})`,
				),
			),
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

	if (toCanonical.length > 0) {
		await db
			.update(book)
			.set({ duplicateOfBookId: null })
			.where(inArray(book.id, toCanonical));
	}
	if (toHidden.length > 0) {
		await db
			.update(book)
			.set({ duplicateOfBookId: canonical.id })
			.where(inArray(book.id, toHidden));
	}

	await syncGroupChanges(canonical.id, toHidden);
}

/**
 * Largest non-locked member currently hidden behind `canonicalId`. Call this
 * BEFORE deleting the canonical: the FK `set null` then clears the pointers.
 */
export async function findMemberToPromote(
	canonicalId: number,
): Promise<{ id: number; uuid: string } | null> {
	const members = await db
		.select({ id: book.id, uuid: book.uuid, filesizeKb: book.filesizeKb })
		.from(book)
		.where(
			and(eq(book.duplicateOfBookId, canonicalId), eq(book.groupLocked, false)),
		);
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

	const selected = await db
		.select({ id: book.id, filesizeKb: book.filesizeKb })
		.from(book)
		.where(inArray(book.id, unique));
	if (selected.length < 2) return null;

	const canonical = pickCanonical(selected);
	const memberRows = await db
		.select({ id: book.id })
		.from(book)
		.where(
			or(inArray(book.id, unique), inArray(book.duplicateOfBookId, unique)),
		);
	const hidden = memberRows
		.map((r) => r.id)
		.filter((id) => id !== canonical.id);

	await db
		.update(book)
		.set({ duplicateOfBookId: null, groupLocked: true })
		.where(eq(book.id, canonical.id));
	if (hidden.length > 0) {
		await db
			.update(book)
			.set({ duplicateOfBookId: canonical.id, groupLocked: true })
			.where(inArray(book.id, hidden));
	}

	await syncGroupChanges(canonical.id, hidden);
	return { canonicalId: canonical.id };
}

/**
 * Manual detach. Marks the book as its own canonical and locks it so a rescan
 * won't re-merge it. Since hidden copies aren't enriched, kick off enrichment
 * now that it's its own source of truth.
 */
export async function ungroupEdition(bookId: number): Promise<void> {
	await db
		.update(book)
		.set({ duplicateOfBookId: null, groupLocked: true })
		.where(eq(book.id, bookId));
	await enqueueSearchSync(bookId, "update");

	const [b] = await db
		.select({ uuid: book.uuid })
		.from(book)
		.where(eq(book.id, bookId))
		.limit(1);
	if (b && !(await bookMetadataRepository.isAmazonEnriched(bookId))) {
		await enqueueBookEnrich(bookId, b.uuid).catch((err) =>
			logger.error({ err }, `[Grouping] enrich enqueue failed for ${bookId}`),
		);
	}
}

/** Queues an Amazon enrichment job for a single ebook (same shape as the scanner). */
export async function enqueueBookEnrich(
	bookId: number,
	uuid: string,
): Promise<void> {
	const enrichTaskId = await getOrCreateAutoEnrichTask();
	await incrementTotalJobs(enrichTaskId, 1);
	await metadataEnrichQueue.add(
		"enrich-book",
		{ bookId, uuid, taskId: enrichTaskId },
		{
			removeOnComplete: { age: 60 },
			removeOnFail: { count: 100 },
			priority: 10,
			attempts: 3,
			backoff: { type: "exponential", delay: 60_000 },
		},
	);
}
