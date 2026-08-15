import { type RefObject, useCallback, useMemo, useState } from "react";
import { PlayerHostReadListenBridge } from "@/components/audio-player/player-host";
import {
	ActiveReadListenCue,
	LoadReadListenAudiobook,
	ReadListenManualFollowPause,
	ReadListenSentenceSeeking,
	SeekReadListenFromText,
} from "@/components/read-listen/read-listen-bindings";
import { useReadListenPlaybackSession } from "@/components/read-listen/use-read-listen-playback-session";
import type { BookReaderApi } from "@/components/reader/reader-shared-props";
import {
	loadReadListenReaderSession,
	resolveReadListenReaderPosition,
} from "@/lib/read-listen/reader-session";
import {
	type ReadListenTimelineCue,
	toReaderSectionReference,
} from "@/lib/read-listen/timeline";
import type { ReaderTheme } from "@/lib/reader/settings";
import type { ReaderSourceFormat, Section } from "@/lib/reader/types";
import { m } from "@/paraglide/messages";

export function ReadListenRuntime({
	pairUuid,
	ebookUuid,
	sourceFormat,
	readerApiRef,
	readerSurfaceRef,
	sections,
	initialTextPosition,
	readerDomRevision,
	playheadRef,
	onExitReadListen,
	theme,
}: {
	pairUuid: string;
	ebookUuid: string;
	sourceFormat: ReaderSourceFormat;
	readerApiRef: RefObject<BookReaderApi | null>;
	readerSurfaceRef: RefObject<HTMLElement | null>;
	sections: Section[];
	initialTextPosition?: number;
	readerDomRevision: string;
	playheadRef?: RefObject<number | undefined>;
	onExitReadListen: () => void;
	theme?: ReaderTheme;
}) {
	const storedReaderSession = useMemo(
		() => loadReadListenReaderSession({ pairUuid }),
		[pairUuid],
	);
	const [followText, setFollowText] = useState(true);
	const [manualFollowSuspended, setManualFollowSuspended] = useState(false);
	const [forceFollowCueId, setForceFollowCueId] = useState<string>();
	const [seekFromText, setSeekFromText] = useState(false);
	const [isInitialTextSeekPending, setIsInitialTextSeekPending] = useState(
		initialTextPosition !== undefined ||
			storedReaderSession?.position !== undefined,
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
		isAudiobookLoaded,
		globalCurrentTime,
		alignmentRevision,
		statusText: currentText,
	} = session;
	if (playheadRef) playheadRef.current = globalCurrentTime;
	const restoredPosition = isAudiobookLoaded
		? resolveReadListenReaderPosition({
				livePosition: undefined,
				exploredCharCount: -1,
				rememberedPosition: storedReaderSession?.position,
				rememberedPlayheadSeconds: storedReaderSession?.positionPlayheadSeconds,
				currentPlayheadSeconds: globalCurrentTime,
				bookCharCount: 0,
			})
		: undefined;
	const entryTextPosition =
		initialTextPosition ?? restoredPosition?.exploredCharCount;
	if (
		isInitialTextSeekPending &&
		isAudiobookLoaded &&
		entryTextPosition === undefined
	) {
		setIsInitialTextSeekPending(false);
	}
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
	// from the audiobook never falls back to an unrelated ebook position.
	const readerCue = activeCue ?? previousCue ?? nextCue;
	const resumeTextFollowing = useCallback(() => {
		setManualFollowSuspended(false);
		setForceFollowCueId(readerCue?.id);
		setFollowText(true);
	}, [readerCue?.id]);
	const toggleTextFollowing = useCallback(() => {
		if (followText) {
			setManualFollowSuspended(false);
			setFollowText(false);
			return;
		}
		resumeTextFollowing();
	}, [followText, resumeTextFollowing]);
	const suspendTextFollowing = useCallback(() => {
		setManualFollowSuspended(true);
		setFollowText(false);
	}, []);
	const settleForcedFollow = useCallback(() => {
		setForceFollowCueId(undefined);
	}, []);
	const playerContext = useMemo(
		() => ({
			readerTheme: theme,
			statusText: currentText,
			onExitReadListen,
			followText,
			onToggleFollowText: toggleTextFollowing,
			seekFromText,
			onToggleSeekFromText: () => setSeekFromText((current) => !current),
		}),
		[
			currentText,
			followText,
			onExitReadListen,
			seekFromText,
			theme,
			toggleTextFollowing,
		],
	);

	return (
		<>
			<PlayerHostReadListenBridge context={playerContext} />
			<div className="sr-only" role="status" aria-live="polite">
				{manualFollowSuspended ? m["read_listen.following_paused"]() : ""}
			</div>
			{session.details && (
				<LoadReadListenAudiobook
					key={session.details.uuid}
					details={session.details}
					isAudiobookLoaded={isAudiobookLoaded}
				/>
			)}
			{entryTextPosition !== undefined &&
				isInitialTextSeekPending &&
				isAudiobookLoaded &&
				timeline.length > 0 &&
				targetsBySection.size > 0 && (
					<SeekReadListenFromText
						key={`${pairUuid}:${alignmentRevision}:${entryTextPosition}:${readerDomRevision}`}
						targetCharacter={entryTextPosition}
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
					forceFollow={readerCue.id === forceFollowCueId}
					onFollowSettled={settleForcedFollow}
					sourceFormat={sourceFormat}
					readerApiRef={readerApiRef}
				/>
			)}
			{followText && !isInitialTextSeekPending && (
				<ReadListenManualFollowPause
					surfaceRef={readerSurfaceRef}
					onPause={suspendTextFollowing}
				/>
			)}
			{seekFromText && isAudiobookLoaded && (
				<ReadListenSentenceSeeking
					key={`${pairUuid}:${alignmentRevision}:${sourceFormat}:${readerDomRevision}`}
					surfaceRef={readerSurfaceRef}
					targetsBySection={targetsBySection}
				/>
			)}
		</>
	);
}
