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

export type ReadListenTimelinePosition = {
	activeIndex: number;
	activeCue: ReadListenTimelineCue | undefined;
	previousCue: ReadListenTimelineCue | undefined;
	nextCue: ReadListenTimelineCue | undefined;
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

/** Finds the cue index under the playhead in O(log n), leaving gaps empty. */
export function resolveReadListenTimelinePosition(
	timeline: ReadListenTimelineCue[],
	globalTimeMs: number,
): ReadListenTimelinePosition {
	let low = 0;
	let high = timeline.length;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		const cue = timeline[middle];
		if (cue && cue.globalStartMs <= globalTimeMs) low = middle + 1;
		else high = middle;
	}
	const nextIndex = low;
	const candidate = nextIndex - 1;
	const cue = candidate >= 0 ? timeline[candidate] : undefined;
	const activeIndex = cue && globalTimeMs < cue.globalEndMs ? candidate : -1;
	return {
		activeIndex,
		activeCue: activeIndex >= 0 ? cue : undefined,
		previousCue: timeline[activeIndex >= 0 ? activeIndex - 1 : candidate],
		nextCue: timeline[activeIndex >= 0 ? activeIndex + 1 : nextIndex],
	};
}

/** Finds the cue index under the playhead in O(log n), leaving gaps empty. */
export function findReadListenCueIndex(
	timeline: ReadListenTimelineCue[],
	globalTimeMs: number,
): number {
	return resolveReadListenTimelinePosition(timeline, globalTimeMs).activeIndex;
}

/** Finds the cue under the playhead in O(log n), leaving narration gaps empty. */
export function findReadListenCue(
	timeline: ReadListenTimelineCue[],
	globalTimeMs: number,
): ReadListenTimelineCue | undefined {
	return resolveReadListenTimelinePosition(timeline, globalTimeMs).activeCue;
}

/** Finds the sentence immediately before or after the playhead in O(log n). */
export function findAdjacentReadListenCue(
	timeline: ReadListenTimelineCue[],
	globalTimeMs: number,
	direction: -1 | 1,
): ReadListenTimelineCue | undefined {
	const position = resolveReadListenTimelinePosition(timeline, globalTimeMs);
	return direction > 0 ? position.nextCue : position.previousCue;
}

export function toReaderSectionReference(
	sectionRef: string,
	format: ReaderSourceFormat,
): string {
	return `ttu-${format}-${sectionRef.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-")}`;
}
