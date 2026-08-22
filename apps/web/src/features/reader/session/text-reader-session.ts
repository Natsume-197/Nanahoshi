import type {
	ReaderPosition,
	Section,
	SectionWithProgress,
} from "@/features/reader/document/types";
import {
	createReaderPositionCore,
	type ReaderPositionRestorePlan,
} from "@/features/reader/session/reader-position";

export interface TextReaderSectionRange {
	startCharacter: number;
	endCharacter: number;
}

/**
 * The semantic session shared by every reflowable text layout. Layouts own
 * pixels; this module owns the book coordinate, restoration policy, and
 * chapter progress so a layout switch cannot redefine what "where I am"
 * means.
 */
export interface TextReaderSession {
	positionFor(
		exploredCharCount: number,
		offset?: { scrollX?: number; scrollY?: number },
	): ReaderPosition;
	planRestore(
		position: ReaderPosition,
		exactCoordinateStillValid: boolean,
	): ReaderPositionRestorePlan;
	sectionProgressFor(
		exploredCharCount: number,
		sectionRanges?: ReadonlyMap<string, TextReaderSectionRange>,
	): Map<string, SectionWithProgress>;
}

export function createTextReaderSession({
	sections,
	getCharacterCount,
}: {
	sections: readonly Section[];
	getCharacterCount: () => number;
}): TextReaderSession {
	const positionCore = createReaderPositionCore({
		sections,
		getCharacterCount,
	});

	return {
		positionFor: positionCore.positionFor,
		planRestore: positionCore.planRestore,
		sectionProgressFor(exploredCharCount, sectionRanges) {
			const progress = new Map<string, SectionWithProgress>();
			for (const section of sections) {
				const range = sectionRanges?.get(section.reference);
				const start = section.startCharacter ?? range?.startCharacter;
				const end =
					start !== undefined && section.characters !== undefined
						? start + section.characters
						: range?.endCharacter;
				const value =
					start === undefined || end === undefined || end <= start
						? 0
						: Math.min(
								100,
								Math.max(
									0,
									((exploredCharCount - start) / (end - start)) * 100,
								),
							);
				progress.set(section.reference, { ...section, progress: value });
			}
			return progress;
		},
	};
}
