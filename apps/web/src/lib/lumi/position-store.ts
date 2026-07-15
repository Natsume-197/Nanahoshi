import {
	isReaderPosition,
	type ReaderPosition,
} from "@lostcoords/lumi-reader-core";

/** localStorage key for a book's saved reading position. */
const key = (uuid: string) => `nanahoshi-lumi-position:${uuid}`;

/** A persisted reading position with its last-updated timestamp. */
interface StoredPosition {
	position: ReaderPosition;
	updatedAt: number;
}

/** Type guard for a valid persisted ReaderPosition with in-range progress fields. */
export function isPersistedReaderPosition(
	value: unknown,
): value is ReaderPosition {
	if (!isReaderPosition(value)) return false;
	const progress = value.progress;
	return (
		Boolean(progress) &&
		Number.isFinite(progress.globalAtomOffset) &&
		progress.globalAtomOffset >= 0 &&
		Number.isFinite(progress.totalAtoms) &&
		progress.totalAtoms >= 0 &&
		Number.isFinite(progress.fraction) &&
		progress.fraction >= 0 &&
		progress.fraction <= 1
	);
}

/** Read the locally persisted reading position for a book, or null if absent/invalid. */
export function getLocalPosition(uuid: string): ReaderPosition | null {
	try {
		const raw = localStorage.getItem(key(uuid));
		if (!raw) return null;
		const stored = JSON.parse(raw) as Partial<StoredPosition>;
		return isPersistedReaderPosition(stored.position) ? stored.position : null;
	} catch {
		return null;
	}
}

/** Persist the reading position for a book with a timestamp. */
export function setLocalPosition(uuid: string, position: ReaderPosition): void {
	try {
		localStorage.setItem(
			key(uuid),
			JSON.stringify({ position, updatedAt: Date.now() }),
		);
	} catch {}
}
