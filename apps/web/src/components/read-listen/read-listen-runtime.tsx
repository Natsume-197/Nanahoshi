import { type RefObject, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MiniPlayer } from "@/components/audio-player/mini-player";
import {
	ActiveReadListenCue,
	LoadReadListenAudiobook,
	ReadListenSentenceSeeking,
	SeekReadListenFromText,
	StopReadListenPlaybackOnExit,
} from "@/components/read-listen/read-listen-bindings";
import { useReadListenPlaybackSession } from "@/components/read-listen/use-read-listen-playback-session";
import type { BookReaderApi } from "@/components/reader/reader-shared-props";
import {
	type ReadListenTimelineCue,
	toReaderSectionReference,
} from "@/lib/read-listen/timeline";
import type { ReaderSourceFormat, Section } from "@/lib/reader/types";

export function ReadListenRuntime({
	pairUuid,
	ebookUuid,
	sourceFormat,
	readerApiRef,
	readerSurfaceRef,
	sections,
	initialTextPosition,
	readerDomRevision,
}: {
	pairUuid: string;
	ebookUuid: string;
	sourceFormat: ReaderSourceFormat;
	readerApiRef: RefObject<BookReaderApi | null>;
	readerSurfaceRef: RefObject<HTMLElement | null>;
	sections: Section[];
	initialTextPosition?: number;
	readerDomRevision: string;
}) {
	const [followText, setFollowText] = useState(true);
	const [seekFromText, setSeekFromText] = useState(false);
	const [isInitialTextSeekPending, setIsInitialTextSeekPending] = useState(
		initialTextPosition !== undefined,
	);
	const [initialSeekCue, setInitialSeekCue] = useState<
		{ cueId: string; playbackReachedCue: boolean } | undefined
	>();
	const session = useReadListenPlaybackSession({ pairUuid, ebookUuid });
	const {
		timeline,
		activeCue,
		previousCue,
		nextCue,
		repeatCue,
		isAudiobookLoaded,
		alignmentRevision,
		statusText: currentText,
		seekToCue,
	} = session;
	const targetsBySection = useMemo(() => {
		const sections = new Map<
			string,
			Array<{
				anchor: ReadListenTimelineCue["text"];
				value: ReadListenTimelineCue;
			}>
		>();
		for (const cue of timeline) {
			const sectionId = toReaderSectionReference(
				cue.text.sectionRef,
				sourceFormat,
			);
			const targets = sections.get(sectionId) ?? [];
			targets.push({ anchor: cue.text, value: cue });
			sections.set(sectionId, targets);
		}
		return sections;
	}, [sourceFormat, timeline]);
	if (initialSeekCue && activeCue) {
		if (
			!initialSeekCue.playbackReachedCue &&
			activeCue.id === initialSeekCue.cueId
		) {
			setInitialSeekCue({ ...initialSeekCue, playbackReachedCue: true });
		} else if (
			initialSeekCue.playbackReachedCue &&
			activeCue.id !== initialSeekCue.cueId
		) {
			setInitialSeekCue(undefined);
		}
	}

	const suppressInitialCueFollow =
		Boolean(initialSeekCue) &&
		(!initialSeekCue?.playbackReachedCue ||
			activeCue?.id === initialSeekCue?.cueId);
	// A paused playhead can sit in a silence between aligned sentences. Keep the
	// reader anchored to the latest cue (or the first upcoming one) so opening
	// from the audiobook never falls back to an unrelated ebook bookmark.
	const readerCue = activeCue ?? previousCue ?? nextCue;

	return (
		<>
			<StopReadListenPlaybackOnExit />
			{session.details && (
				<LoadReadListenAudiobook
					key={session.details.uuid}
					details={session.details}
					isAudiobookLoaded={isAudiobookLoaded}
				/>
			)}
			{initialTextPosition !== undefined &&
				isInitialTextSeekPending &&
				isAudiobookLoaded &&
				timeline.length > 0 &&
				targetsBySection.size > 0 && (
					<SeekReadListenFromText
						key={`${pairUuid}:${alignmentRevision}:${initialTextPosition}:${readerDomRevision}`}
						targetCharacter={initialTextPosition}
						sections={sections}
						targetsBySection={targetsBySection}
						readerApiRef={readerApiRef}
						sourceFormat={sourceFormat}
						onSettled={(cue) => {
							setInitialSeekCue(
								cue ? { cueId: cue.id, playbackReachedCue: false } : undefined,
							);
							setIsInitialTextSeekPending(false);
						}}
					/>
				)}
			{readerCue && !isInitialTextSeekPending && (
				<ActiveReadListenCue
					key={`${alignmentRevision}:${sourceFormat}:${readerCue.id}:${followText}:${readerDomRevision}`}
					cue={readerCue}
					sectionTargets={
						targetsBySection.get(
							toReaderSectionReference(readerCue.text.sectionRef, sourceFormat),
						) ?? []
					}
					followText={followText && !suppressInitialCueFollow}
					sourceFormat={sourceFormat}
					readerApiRef={readerApiRef}
				/>
			)}
			{seekFromText && isAudiobookLoaded && (
				<ReadListenSentenceSeeking
					key={`${pairUuid}:${alignmentRevision}:${sourceFormat}:${readerDomRevision}`}
					surfaceRef={readerSurfaceRef}
					targetsBySection={targetsBySection}
				/>
			)}
			{typeof document !== "undefined" &&
				createPortal(
					<MiniPlayer
						placement="reader"
						readListen={{
							statusText: currentText,
							canSeekPreviousSentence: Boolean(previousCue),
							onSeekPreviousSentence: () => {
								if (previousCue) seekToCue(previousCue);
							},
							canSeekNextSentence: Boolean(nextCue),
							onSeekNextSentence: () => {
								if (nextCue) seekToCue(nextCue);
							},
							canRepeatSentence: Boolean(repeatCue),
							onRepeatSentence: () => {
								if (repeatCue) seekToCue(repeatCue);
							},
							followText,
							onToggleFollowText: () => setFollowText((current) => !current),
							seekFromText,
							onToggleSeekFromText: () =>
								setSeekFromText((current) => !current),
						}}
					/>,
					document.body,
				)}
		</>
	);
}
