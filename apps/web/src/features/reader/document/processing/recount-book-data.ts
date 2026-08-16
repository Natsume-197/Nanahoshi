import type { ReaderBookData, Section } from "../types";
import { getCharacterCount } from "./character-count";
import { getParagraphNodes } from "./get-paragraph-nodes";

/**
 * Re-derives `characters` and section weights from parsed book HTML. Mirrors
 * generateEpubHtml's aggregation: a parented section folds its count into the
 * current main chapter; `startCharacter` is the running total of the previous
 * main chapters.
 */
export function recountBookData(
	data: ReaderBookData,
	document: Document,
): ReaderBookData {
	const staging = document.implementation.createHTMLDocument("");
	const container = staging.createElement("div");
	container.innerHTML = data.elementHtml;

	const countByReference = new Map<string, number>();
	let characters = 0;
	for (const child of Array.from(container.children)) {
		const count = getParagraphNodes(child).reduce(
			(acc, node) => acc + getCharacterCount(node),
			0,
		);
		countByReference.set(child.id, count);
		characters += count;
	}

	const sections: Section[] = data.sections.map((section) => ({ ...section }));
	let currentMain: Section | undefined;
	let runningStart = 0;
	for (const section of sections) {
		const own = countByReference.get(section.reference) ?? 0;
		section.charactersWeight = own || 1;
		if (!section.parentChapter) {
			if (currentMain) runningStart += currentMain.characters ?? 0;
			currentMain = section;
			section.startCharacter = runningStart;
			section.characters = own;
		} else if (currentMain) {
			currentMain.characters = (currentMain.characters ?? 0) + own;
		}
	}

	return { ...data, characters, sections };
}
