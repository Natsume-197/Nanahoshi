import type { ReaderPosition } from "@/features/reader/document/types";
import { READER_STORAGE_KEYS } from "@/features/reader/presentation/reader-storage";

export interface ManualReadingPoint {
	manual: boolean;
	position?: ReaderPosition;
}

export function loadManualReadingPoint(uuid: string): ManualReadingPoint {
	try {
		const entries = JSON.parse(
			window.localStorage.getItem(READER_STORAGE_KEYS.manualReadingPoints) ??
				"{}",
		);
		const entry = entries[uuid];
		if (typeof entry?.manual !== "boolean") return { manual: false };
		const position = entry.position;
		if (
			position &&
			(!Number.isFinite(position.exploredCharCount) ||
				position.exploredCharCount < 0 ||
				!Number.isFinite(position.modifiedAt))
		)
			return { manual: false };
		return { manual: entry.manual, position };
	} catch {
		return { manual: false };
	}
}

export function saveManualReadingPoint(
	uuid: string,
	point: ManualReadingPoint,
): boolean {
	try {
		const entries = JSON.parse(
			window.localStorage.getItem(READER_STORAGE_KEYS.manualReadingPoints) ??
				"{}",
		);
		entries[uuid] = point;
		window.localStorage.setItem(
			READER_STORAGE_KEYS.manualReadingPoints,
			JSON.stringify(entries),
		);
		return true;
	} catch {
		return false;
	}
}

export function resumeReadingPosition(
	point: ManualReadingPoint,
	automatic: ReaderPosition | undefined,
) {
	return point.manual ? (point.position ?? automatic) : automatic;
}
