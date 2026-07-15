import type { Book, Chapter } from "@lostcoords/lumi-epub";
import {
	buildPosition,
	type ReaderPosition,
} from "@lostcoords/lumi-reader-core";
import type { SectionWithProgress } from "@/lib/reader/types";

/** A flattened nav entry with its absolute start-atom offset. */
interface FlatEntry {
	label: string;
	spineIndex: number;
	offset: number;
	startAtom: number;
}

/** Recursively flatten nested nav chapters into a single-level list of entries. */
function flatten(
	chapters: Chapter[],
	sectionStart: (index: number) => number,
	out: FlatEntry[],
): void {
	for (const chapter of chapters) {
		if (chapter.target) {
			out.push({
				label: chapter.label,
				spineIndex: chapter.target.spineIndex,
				offset: chapter.target.offset,
				startAtom:
					sectionStart(chapter.target.spineIndex) + chapter.target.offset,
			});
		}
		if (chapter.children.length > 0)
			flatten(chapter.children, sectionStart, out);
	}
}

/** Build the section-progress map the shared ReaderToc renders, from the book's nav tree and atom offsets. */
export function buildTocSections(
	book: Book | null,
	currentAtom: number,
): Map<string, SectionWithProgress> {
	const map = new Map<string, SectionWithProgress>();
	if (!book) return map;

	const startByIndex = new Map(
		book.sections.map((s) => [s.spineIndex, s.startAtom]),
	);
	const sectionStart = (index: number) => startByIndex.get(index) ?? 0;

	const flat: FlatEntry[] = [];
	flatten(book.chapters, sectionStart, flat);
	flat.sort((a, b) => a.startAtom - b.startAtom);

	const total = book.totalAtoms || 1;
	flat.forEach((entry, i) => {
		const nextStart = i + 1 < flat.length ? flat[i + 1].startAtom : total;
		const characters = Math.max(nextStart - entry.startAtom, 0);
		const progress =
			characters > 0
				? Math.min(
						100,
						Math.max(0, ((currentAtom - entry.startAtom) / characters) * 100),
					)
				: currentAtom >= entry.startAtom
					? 100
					: 0;
		const reference = `${entry.spineIndex}:${entry.offset}`;
		map.set(reference, {
			reference,
			label: entry.label,
			charactersWeight: characters || 1,
			startCharacter: entry.startAtom,
			characters,
			progress,
		});
	});

	return map;
}

/** Resolve a TOC reference (`spineIndex:offset`) to a ReaderPosition, or null if invalid. */
export function positionForTocReference(
	book: Book,
	reference: string,
): ReaderPosition | null {
	const match = /^(\d+):(\d+)$/.exec(reference);
	if (!match) return null;

	const spineIndex = Number(match[1]);
	const offset = Number(match[2]);
	const section = book.sections[spineIndex];
	if (!section) return null;

	return buildPosition(book, spineIndex, section.href, offset);
}
