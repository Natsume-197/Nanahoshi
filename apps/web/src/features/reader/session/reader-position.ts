import {
	READER_POSITION_VERSION,
	type ReaderPosition,
	type Section,
} from "@/features/reader/document/types";

/**
 * The one semantic coordinate shared by loading, sync, every renderer and
 * local restore. It deliberately hides locator migration and stale-pixel
 * fallback behind one position module.
 */
export interface ReaderPositionCore {
	positionFor(
		exploredCharCount: number,
		offset?: { scrollX?: number; scrollY?: number },
	): ReaderPosition;
	planRestore(
		position: ReaderPosition,
		exactCoordinateStillValid: boolean,
	): ReaderPositionRestorePlan;
}

export interface ReaderPositionRestorePlan {
	exploredCharCount: number;
	useExactCoordinate: boolean;
}

interface CreateReaderPositionCoreOptions {
	sections: readonly Section[];
	getCharacterCount: () => number;
	now?: () => number;
}

export function locatorForExploredCharacter(
	sections: readonly Section[],
	exploredCharCount: number,
): ReaderPosition["locator"] {
	const mainSections = sections.filter(
		(section) =>
			!section.parentChapter && Number.isFinite(section.startCharacter),
	);
	let index = -1;
	for (let candidate = 0; candidate < mainSections.length; candidate += 1) {
		const start =
			mainSections[candidate]?.startCharacter ?? Number.POSITIVE_INFINITY;
		if (start > exploredCharCount) break;
		index = candidate;
	}
	const section = mainSections[index];
	if (!section || section.startCharacter === undefined) return undefined;
	const nextStart = mainSections[index + 1]?.startCharacter;
	const sectionLength =
		nextStart === undefined
			? section.characters
			: Math.max(0, nextStart - section.startCharacter);
	const offset = Math.max(0, exploredCharCount - section.startCharacter);
	return {
		sectionReference: section.reference,
		characterOffset:
			sectionLength === undefined ? offset : Math.min(sectionLength, offset),
	};
}

export function exploredCharacterForLocator(
	sections: readonly Section[],
	locator: ReaderPosition["locator"] | undefined,
): number | undefined {
	if (!locator) return undefined;
	const section = sections.find(
		(candidate) =>
			!candidate.parentChapter &&
			candidate.reference === locator.sectionReference &&
			Number.isFinite(candidate.startCharacter),
	);
	if (!section || section.startCharacter === undefined) return undefined;
	const maxOffset = section.characters;
	const offset = Math.max(
		0,
		maxOffset === undefined
			? locator.characterOffset
			: Math.min(maxOffset, locator.characterOffset),
	);
	return section.startCharacter + offset;
}

export function createReaderPositionCore({
	sections,
	getCharacterCount,
	now = Date.now,
}: CreateReaderPositionCoreOptions): ReaderPositionCore {
	const clamp = (value: number) => {
		const characterCount = getCharacterCount();
		const nonNegative = Math.max(0, value);
		return characterCount > 0
			? Math.min(characterCount, nonNegative)
			: nonNegative;
	};

	return {
		positionFor(exploredCharCount, offset = {}) {
			const explored = clamp(exploredCharCount);
			const characterCount = getCharacterCount();
			return {
				exploredCharCount: explored,
				progress: characterCount > 0 ? explored / characterCount : 0,
				...offset,
				modifiedAt: now(),
				locator: locatorForExploredCharacter(sections, explored),
			};
		},
		planRestore(position, exactCoordinateStillValid) {
			const savedCoordinate = clamp(position.exploredCharCount);
			if (exactCoordinateStillValid) {
				return { exploredCharCount: savedCoordinate, useExactCoordinate: true };
			}
			const locatedCoordinate = exploredCharacterForLocator(
				sections,
				position.locator,
			);
			return {
				exploredCharCount: clamp(locatedCoordinate ?? savedCoordinate),
				useExactCoordinate: false,
			};
		},
	};
}

export function restoredReaderPositionState(
	position: ReaderPosition | undefined,
) {
	return { position, exploredCharCount: position?.exploredCharCount ?? 0 };
}

export function positionForLoadedReader(
	activePosition: ReaderPosition | undefined,
	restoredPosition: ReaderPosition | undefined,
) {
	return restoredReaderPositionState(activePosition ?? restoredPosition);
}

interface ServerReadingPosition {
	exploredCharCount: number;
	bookCharCount?: number;
	modifiedAt: number;
}

export function resolveReadingPosition(
	local: ReaderPosition | undefined,
	serverProgress: ServerReadingPosition,
	currentBookCharCount?: number,
): ReaderPosition | undefined {
	const rescale = (count: number, previousTotal?: number) =>
		currentBookCharCount && previousTotal && previousTotal > 0
			? Math.round((count / previousTotal) * currentBookCharCount)
			: count;
	const migratedLocal = local
		? local.positionVersion === READER_POSITION_VERSION || !currentBookCharCount
			? local
			: {
					...local,
					exploredCharCount: Math.round(
						Math.min(1, Math.max(0, local.progress || 0)) *
							currentBookCharCount,
					),
					progress: Math.min(1, Math.max(0, local.progress || 0)),
					positionVersion: READER_POSITION_VERSION,
				}
		: undefined;
	const remote: ReaderPosition | undefined = serverProgress.exploredCharCount
		? {
				exploredCharCount: rescale(
					serverProgress.exploredCharCount,
					serverProgress.bookCharCount,
				),
				progress:
					serverProgress.bookCharCount && serverProgress.bookCharCount > 0
						? serverProgress.exploredCharCount / serverProgress.bookCharCount
						: 0,
				modifiedAt: serverProgress.modifiedAt,
				positionVersion: READER_POSITION_VERSION,
			}
		: undefined;
	if (!migratedLocal || !remote) return migratedLocal ?? remote;
	return migratedLocal.exploredCharCount === remote.exploredCharCount ||
		(migratedLocal.modifiedAt ?? 0) > remote.modifiedAt
		? migratedLocal
		: remote;
}
