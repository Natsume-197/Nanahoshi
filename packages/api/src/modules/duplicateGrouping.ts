import { logger } from "../lib/logger";
import { bookRepository } from "../routers/books/book.repository";
import { enrichmentStateRepository } from "../routers/enrichment/enrichment.repository";
import {
	assessCatalogIdentity,
	assessGroupMembership,
	type CatalogIdentityEvidence,
	primaryProviderEditionMatch,
} from "./catalogIdentity";
import {
	isUsableEmbeddedUid,
	isValidAsin,
	isValidIsbn10,
	isValidIsbn13,
	normalizeAsin,
	normalizeEmbeddedUid,
	normalizeIsbn,
} from "./identifiers";
import { enqueueMetadataEnrichment } from "./metadataEnrichment/metadata-enrichment.admission";

// Identifier validation lives in ./identifiers (pure, infra-free) so the local
// EPUB provider can reuse it; re-exported here for existing callers.
export {
	isValidAsin,
	isValidIsbn10,
	isValidIsbn13,
	normalizeAsin,
	normalizeIsbn,
};

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

function validAsinSet(meta: { asin: string | null }): string[] {
	if (meta.asin && isValidAsin(meta.asin)) return [normalizeAsin(meta.asin)];
	return [];
}

// Opaque OPF unique-identifier: no checksum exists, so beyond the format
// guards the only defense is the boilerplate cap below + the title veto.
function usableUidSet(meta: { embeddedUid: string | null }): string[] {
	if (meta.embeddedUid && isUsableEmbeddedUid(meta.embeddedUid))
		return [normalizeEmbeddedUid(meta.embeddedUid)];
	return [];
}

// A publisher id stamped on this many books in one library is boilerplate
// (tool default, series-wide id), not an edition identifier — ignore it.
const EMBEDDED_UID_BOILERPLATE_CAP = 8;

type GroupingRow = {
	title: string | null;
	titleRomaji: string | null;
	isbn13?: string | null;
	isbn10?: string | null;
	asin?: string | null;
	embeddedUid?: string | null;
	languageCode?: string | null;
	catalogMatches?: unknown;
	catalogMatchStatus?: string | null;
};

function authoritativeProviderEdition(row: GroupingRow) {
	return row.catalogMatchStatus === "enriched" ||
		row.catalogMatchStatus === "partial"
		? primaryProviderEditionMatch(row.catalogMatches)
		: null;
}

function groupingEvidence(
	row: GroupingRow,
	embeddedUidOccurrenceCount?: number,
	fallback?: GroupingRow,
): CatalogIdentityEvidence {
	const providerEdition = authoritativeProviderEdition(row);
	const hasIdentifier = Boolean(
		row.isbn13 ?? row.isbn10 ?? row.asin ?? row.embeddedUid ?? providerEdition,
	);
	const identifiers = hasIdentifier ? row : (fallback ?? row);
	const fallbackProviderEdition = authoritativeProviderEdition(identifiers);
	return {
		kind: "book",
		title: row.title,
		titleRomaji: row.titleRomaji,
		isbn13: identifiers.isbn13,
		isbn10: identifiers.isbn10,
		asin: identifiers.asin,
		embeddedUid: identifiers.embeddedUid,
		embeddedUidOccurrenceCount,
		languageCode: row.languageCode,
		identifiers: fallbackProviderEdition
			? [fallbackProviderEdition.identifier]
			: [],
	};
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

async function clearGroup(bookId: number): Promise<void> {
	await bookRepository.clearDuplicatePointerIfSet(bookId);
}

// Recompute the duplicate group for `bookId` by validated ISBN/ASIN within its
// library, with the title veto: hide non-canonical members behind the canonical
// (largest file). Skips group_locked books (manual decisions win).
export async function regroupBookDuplicates(bookId: number): Promise<void> {
	const row = await bookRepository.getGroupingInfo(bookId);
	if (!row || row.groupLocked) return;
	if (row.automaticGroupingEnabled === false) {
		await clearGroup(bookId);
		return;
	}

	const isbns = validIsbnSet(row);
	const asins = validAsinSet(row);
	const primaryEdition = authoritativeProviderEdition(row);
	let uids = usableUidSet(row);
	let embeddedUidOccurrenceCount: number | undefined;
	if (uids.length > 0 && row.libraryId != null) {
		const uid = uids[0] as string;
		const shared = await bookRepository.countBooksWithEmbeddedUid(
			row.libraryId,
			uid,
		);
		embeddedUidOccurrenceCount = shared;
		if (shared > EMBEDDED_UID_BOILERPLATE_CAP) uids = [];
	}
	if (
		row.libraryId == null ||
		(isbns.length === 0 &&
			asins.length === 0 &&
			uids.length === 0 &&
			!primaryEdition)
	) {
		await clearGroup(bookId);
		return;
	}

	const candidates = await bookRepository.findGroupingCandidates(
		row.libraryId,
		{
			isbns,
			asins,
			uids,
			primaryCatalogMatch: primaryEdition?.match,
		},
	);

	// First require a Confirmed relationship to the subject. Then apply the
	// group rule against every accepted member so an ambiguous bridge cannot
	// join two editions that explicitly reject each other.
	const subjectEvidence = groupingEvidence(row, embeddedUidOccurrenceCount);
	const eligible = candidates.filter(
		(candidate) =>
			candidate.id === bookId ||
			assessCatalogIdentity(
				subjectEvidence,
				groupingEvidence(candidate, embeddedUidOccurrenceCount, row),
			).status === "confirmed",
	);
	const subjectMember = eligible.find((candidate) => candidate.id === bookId);
	const ordered = eligible
		.filter((candidate) => candidate.id !== bookId)
		.sort((a, b) => {
			const af = a.filesizeKb ?? -1;
			const bf = b.filesizeKb ?? -1;
			return bf !== af ? bf - af : a.id - b.id;
		});
	const members: typeof candidates = subjectMember ? [subjectMember] : [];
	for (const candidate of ordered) {
		const verdict = assessGroupMembership(
			groupingEvidence(candidate, embeddedUidOccurrenceCount, row),
			members.map((member) =>
				groupingEvidence(member, embeddedUidOccurrenceCount, row),
			),
		);
		if (verdict.status === "confirmed") members.push(candidate);
	}

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
}

// Largest non-locked member currently hidden behind `canonicalId`. Call BEFORE
// deleting the canonical: the FK `set null` then clears the pointers.
export async function findMemberToPromote(
	canonicalId: number,
): Promise<{ id: number; uuid: string } | null> {
	const members = await bookRepository.listHiddenMembers(canonicalId);
	if (members.length === 0) return null;
	const top = pickCanonical(members);
	return { id: top.id, uuid: top.uuid };
}

// Manual grouping: no ISBN or title veto required, so it can group editions the
// automation can't detect (e.g. ASIN-only). Absorbs existing hidden members to
// avoid nested chains.
export async function groupAsEditions(
	bookIds: number[],
): Promise<{ canonicalId: number } | null> {
	const unique = [...new Set(bookIds)];
	if (unique.length < 2) return null;

	const selected = await bookRepository.listByIdsWithSize(unique);
	if (selected.length < 2) return null;
	if (new Set(selected.map((item) => item.mediaType)).size !== 1) return null;

	const canonical = pickCanonical(selected);
	const memberRows = await bookRepository.listGroupMemberIds(unique);
	if (new Set(memberRows.map((item) => item.mediaType)).size !== 1) return null;
	const hidden = memberRows
		.map((r) => r.id)
		.filter((id) => id !== canonical.id);

	await bookRepository.lockAsCanonical(canonical.id);
	await bookRepository.lockAsHidden(hidden, canonical.id);

	return { canonicalId: canonical.id };
}

// Manual detach: mark the book as its own canonical and lock it against rescan
// re-merges. Hidden copies aren't enriched, so kick off enrichment now.
export async function ungroupEdition(bookId: number): Promise<void> {
	await bookRepository.lockAsCanonical(bookId);

	const uuid = await bookRepository.getUuid(bookId);
	if (
		uuid &&
		(await enrichmentStateRepository.shouldReopenAfterDuplicateRelease(bookId))
	) {
		await enqueueBookEnrich(bookId, uuid).catch((err) =>
			logger.error({ err }, `[Grouping] enrich enqueue failed for ${bookId}`),
		);
	}
}

// Enrich an ebook that just became its own source of truth (promotion/ungroup).
// Incidental work, so it carries no taskId and isn't counted.
export async function enqueueBookEnrich(
	bookId: number,
	uuid: string,
): Promise<void> {
	await enqueueMetadataEnrichment({ bookId, uuid });
}
