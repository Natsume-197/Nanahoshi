import type { ReadListenCue } from "@nanahoshi-v2/read-listen/manifest";
import type { ReaderSourceFormat } from "@/lib/reader/types";

export type ReadListenTimelineCue = ReadListenCue & {
	globalStartMs: number;
	globalEndMs: number;
};

export type ReadListenAudioFile = {
	index: number;
	duration: number;
};

/** Builds one global clock over a possibly multi-file audiobook. */
export function createReadListenTimeline(
	cues: ReadListenCue[],
	audioFiles: ReadListenAudioFile[],
): ReadListenTimelineCue[] {
	const offsets = new Map<number, number>();
	let offsetMs = 0;
	for (const audio of [...audioFiles].sort(
		(left, right) => left.index - right.index,
	)) {
		offsets.set(audio.index, offsetMs);
		offsetMs += Math.max(0, audio.duration * 1000);
	}

	return cues.map((cue) => {
		const offset = offsets.get(cue.audioFileIndex);
		if (offset === undefined) {
			throw new Error(`Missing audiobook file ${cue.audioFileIndex}`);
		}
		return {
			...cue,
			globalStartMs: offset + cue.startMs,
			globalEndMs: offset + cue.endMs,
		};
	});
}

/** Finds the cue under the playhead in O(log n), leaving narration gaps empty. */
export function findReadListenCue(
	timeline: ReadListenTimelineCue[],
	globalTimeMs: number,
): ReadListenTimelineCue | undefined {
	let low = 0;
	let high = timeline.length - 1;
	let candidate = -1;
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const cue = timeline[middle];
		if (!cue || cue.globalStartMs > globalTimeMs) {
			high = middle - 1;
		} else {
			candidate = middle;
			low = middle + 1;
		}
	}
	const cue = candidate >= 0 ? timeline[candidate] : undefined;
	return cue && globalTimeMs < cue.globalEndMs ? cue : undefined;
}

/** Finds the sentence immediately before or after the playhead in O(log n). */
export function findAdjacentReadListenCue(
	timeline: ReadListenTimelineCue[],
	globalTimeMs: number,
	direction: -1 | 1,
): ReadListenTimelineCue | undefined {
	let low = 0;
	let high = timeline.length;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		const cue = timeline[middle];
		if (cue && cue.globalStartMs <= globalTimeMs) low = middle + 1;
		else high = middle;
	}
	const nextIndex = low;
	const currentOrPreviousIndex = nextIndex - 1;
	const currentOrPrevious = timeline[currentOrPreviousIndex];
	const isInsideCue = Boolean(
		currentOrPrevious && globalTimeMs < currentOrPrevious.globalEndMs,
	);
	const targetIndex =
		direction > 0
			? isInsideCue
				? currentOrPreviousIndex + 1
				: nextIndex
			: isInsideCue
				? currentOrPreviousIndex - 1
				: currentOrPreviousIndex;
	return timeline[targetIndex];
}

export function toReaderSectionReference(
	sectionRef: string,
	format: ReaderSourceFormat,
): string {
	return `ttu-${format}-${sectionRef.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-")}`;
}
