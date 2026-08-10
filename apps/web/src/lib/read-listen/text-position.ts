import { getCharacterCount } from "@/lib/reader/character-count";
import { getParagraphNodes } from "@/lib/reader/get-paragraph-nodes";
import type { Section } from "@/lib/reader/types";
import {
	createReadListenPositionIndex,
	type ReadListenAnchorTarget,
} from "./text-anchor";

type SectionTargets<T> = Map<string, Array<ReadListenAnchorTarget<T>>>;

type SectionPosition = {
	id: string;
	start: number;
	end: number;
};

function sectionPositions(sections: Section[]): SectionPosition[] {
	let runningStart = 0;
	return sections.map((section) => {
		const start = section.startCharacter ?? runningStart;
		const end = start + Math.max(0, section.characters ?? 0);
		runningStart = Math.max(runningStart, end);
		return { id: section.reference, start, end };
	});
}

function distanceToSection(target: number, section: SectionPosition): number {
	if (target < section.start) return section.start - target;
	if (target > section.end) return target - section.end;
	return 0;
}

function characterOffsets(section: Element): Map<Text, number> {
	const offsets = new Map<Text, number>();
	let count = 0;
	for (const node of getParagraphNodes(section)) {
		if (node.nodeType === Node.TEXT_NODE) offsets.set(node as Text, count);
		count += getCharacterCount(node);
	}
	return offsets;
}

/** Finds the aligned cue closest to the reader's mode-neutral char position. */
export function findReadListenCueNearCharacter<T>(input: {
	targetCharacter: number;
	sections: Section[];
	targetsBySection: SectionTargets<T>;
	document: Document;
}): T | undefined {
	const rankedSections = sectionPositions(input.sections)
		.filter((section) => input.targetsBySection.has(section.id))
		.map((section) => ({
			...section,
			distance: distanceToSection(input.targetCharacter, section),
		}))
		.sort((left, right) => left.distance - right.distance);

	let closest: { value: T; distance: number } | undefined;
	for (const sectionPosition of rankedSections) {
		if (closest && sectionPosition.distance > closest.distance) break;
		const section = input.document.getElementById(sectionPosition.id);
		const targets = input.targetsBySection.get(sectionPosition.id);
		if (!section || !targets?.length) continue;

		const offsets = characterOffsets(section);
		const index = createReadListenPositionIndex(section, targets);
		for (const match of index.matches) {
			const first = match.resolved.segments[0];
			const nodeStart = first ? offsets.get(first.node) : undefined;
			if (!first || nodeStart === undefined) continue;
			const prefix = input.document.createTextNode(
				first.node.data.slice(0, first.startOffset),
			);
			const position =
				sectionPosition.start + nodeStart + getCharacterCount(prefix);
			const distance = Math.abs(position - input.targetCharacter);
			if (!closest || distance < closest.distance) {
				closest = { value: match.value, distance };
			}
		}
	}

	return closest?.value;
}
