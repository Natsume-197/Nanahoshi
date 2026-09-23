import { type RefObject, useCallback, useMemo, useRef, useState } from "react";
import { PlayerHostReadListenBridge } from "@/components/audio-player/player-host";
import {
	ActiveReadListenCue,
	LoadReadListenAudiobook,
	ReadListenManualFollowPause,
	ReadListenSentenceSeeking,
	SeekReadListenFromText,
} from "@/components/read-listen/read-listen-bindings";
import { useReadListenPlaybackSession } from "@/components/read-listen/use-read-listen-playback-session";
import { useAudioPlayerActions } from "@/context/audio-player-context";
import type {
	ReaderSourceFormat,
	Section,
} from "@/features/reader/document/types";
import type { ReaderTheme } from "@/features/reader/presentation/settings";
import type { BookReaderApi } from "@/features/reader/reader-contract";
import {
	FOCUS_SENTENCE_NAVIGATION_EVENT,
	type FocusSentenceNavigationDetail,
} from "@/features/reader/renderers/focus/focus-navigation";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { findReadListenCueNearCharacter } from "@/lib/read-listen/text-position";
import {
	type ReadListenTimelineCue,
	toReaderSectionReference,
} from "@/lib/read-listen/timeline";
import { m } from "@/paraglide/messages";
import { client } from "@/utils/orpc";

export function readListenLineEndDelay(input: {
	globalEndMs: number;
	globalCurrentTime: number;
	playbackRate: number;
}) {
	return Math.max(
		0,
		(input.globalEndMs - input.globalCurrentTime * 1000) /
			Math.max(input.playbackRate, 0.1),
	);
}

const LINE_START_PREROLL_MS = 200;

export function readListenLineStartTime(globalStartMs: number) {
	return Math.max(0, globalStartMs - LINE_START_PREROLL_MS) / 1000;
}

function ReadListenFocusLinePlayback({
	activeCue,
	isPlaying,
	playbackRate,
	readerSurfaceRef,
	sections,
	targetsBySection,
}: {
	activeCue: ReadListenTimelineCue | undefined;
	isPlaying: boolean;
	globalCurrentTime: number;
	playbackRate: number;
	readerSurfaceRef: RefObject<HTMLElement | null>;
	sections: Section[];
	targetsBySection: Map<
		string,
		Array<{
			anchor: ReadListenTimelineCue["text"];
			value: ReadListenTimelineCue;
		}>
	>;
}) {
	const { getGlobalCurrentTime, pause, play, seekTo } = useAudioPlayerActions();
	const automaticallyPausedCueRef = useRef<ReadListenTimelineCue | undefined>(
		undefined,
	);
	const pauseTimeoutRef = useRef<number | undefined>(undefined);
	const playbackTargetRevisionRef = useRef(0);
	const [playbackTarget, setPlaybackTarget] = useState<
		| {
				cue: ReadListenTimelineCue;
				revision: number;
		  }
		| undefined
	>(undefined);

	const cancelScheduledPause = useCallback(() => {
		if (pauseTimeoutRef.current === undefined) return;
		window.clearTimeout(pauseTimeoutRef.current);
		pauseTimeoutRef.current = undefined;
	}, []);
	const selectPlaybackTarget = useCallback(
		(cue: ReadListenTimelineCue | undefined) => {
			cancelScheduledPause();
			if (!cue) {
				setPlaybackTarget(undefined);
				return;
			}
			playbackTargetRevisionRef.current += 1;
			setPlaybackTarget({
				cue,
				revision: playbackTargetRevisionRef.current,
			});
		},
		[cancelScheduledPause],
	);

	if (isPlaying && !playbackTarget && activeCue) {
		playbackTargetRevisionRef.current += 1;
		setPlaybackTarget({
			cue: activeCue,
			revision: playbackTargetRevisionRef.current,
		});
	}

	const navigationInputs = useRef({
		sections,
		targetsBySection,
		getGlobalCurrentTime,
		play,
		seekTo,
	});
	navigationInputs.current = {
		sections,
		targetsBySection,
		getGlobalCurrentTime,
		play,
		seekTo,
	};
	useMountEffect(() => {
		const surface = readerSurfaceRef.current;
		if (!surface) return;
		let navigationFrame = 0;
		const handleNavigation = (event: Event) => {
			const detail = (event as CustomEvent<FocusSentenceNavigationDetail>)
				.detail;
			const character = detail?.character;
			if (!Number.isFinite(character)) return;
			cancelAnimationFrame(navigationFrame);
			navigationFrame = requestAnimationFrame(() => {
				const {
					sections,
					targetsBySection,
					getGlobalCurrentTime,
					play,
					seekTo,
				} = navigationInputs.current;
				const cue = findReadListenCueNearCharacter({
					targetCharacter: character,
					sections,
					targetsBySection,
					document: surface.ownerDocument,
				});
				if (!cue) return;
				const automaticallyPausedCue = automaticallyPausedCueRef.current;
				const playheadMs = getGlobalCurrentTime() * 1000;
				const canContinueWithoutSeeking = Boolean(
					detail.direction === 1 &&
						automaticallyPausedCue &&
						cue.globalStartMs >= automaticallyPausedCue.globalEndMs &&
						playheadMs >= automaticallyPausedCue.globalEndMs - 500 &&
						playheadMs <= cue.globalStartMs,
				);
				automaticallyPausedCueRef.current = undefined;
				selectPlaybackTarget(cue);
				if (!canContinueWithoutSeeking) {
					seekTo(readListenLineStartTime(cue.globalStartMs));
				}
				play();
			});
		};
		surface.addEventListener(FOCUS_SENTENCE_NAVIGATION_EVENT, handleNavigation);
		return () => {
			cancelAnimationFrame(navigationFrame);
			surface.removeEventListener(
				FOCUS_SENTENCE_NAVIGATION_EVENT,
				handleNavigation,
			);
		};
	});

	return isPlaying && playbackTarget ? (
		<ReadListenLineEndPause
			key={`${playbackTarget.revision}:${playbackRate}`}
			delay={readListenLineEndDelay({
				globalEndMs: playbackTarget.cue.globalEndMs,
				globalCurrentTime: getGlobalCurrentTime(),
				playbackRate,
			})}
			timeoutRef={pauseTimeoutRef}
			onPause={() => {
				if (playbackTargetRevisionRef.current !== playbackTarget.revision)
					return;
				automaticallyPausedCueRef.current = playbackTarget.cue;
				setPlaybackTarget(undefined);
				pause();
			}}
		/>
	) : null;
}

function ReadListenLineEndPause({
	delay,
	timeoutRef,
	onPause,
}: {
	delay: number;
	timeoutRef: RefObject<number | undefined>;
	onPause: () => void;
}) {
	useMountEffect(() => {
		const timeout = window.setTimeout(() => {
			timeoutRef.current = undefined;
			onPause();
		}, delay);
		timeoutRef.current = timeout;
		return () => {
			window.clearTimeout(timeout);
			if (timeoutRef.current === timeout) timeoutRef.current = undefined;
		};
	});
	return null;
}

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
	pauseAudioAfterLine = false,
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
	pauseAudioAfterLine?: boolean;
	onExitReadListen: () => void;
	theme?: ReaderTheme;
}) {
	const [followText, setFollowText] = useState(true);
	const [manualFollowSuspended, setManualFollowSuspended] = useState(false);
	const [forceFollowCueId, setForceFollowCueId] = useState<string>();
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
		isAudiobookLoaded,
		globalCurrentTime,
		isPlaying,
		playbackRate,
		alignmentRevision,
		statusText: currentText,
	} = session;
	if (playheadRef) playheadRef.current = globalCurrentTime;
	const entryTextPosition = initialTextPosition;
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
			<ReadListenPresence
				key={`${ebookUuid}:${pairUuid}`}
				ebookUuid={ebookUuid}
				pairUuid={pairUuid}
			/>
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
			{pauseAudioAfterLine && isAudiobookLoaded && (
				<ReadListenFocusLinePlayback
					key={`${pairUuid}:${alignmentRevision}:${readerDomRevision}`}
					activeCue={activeCue}
					isPlaying={isPlaying}
					globalCurrentTime={globalCurrentTime}
					playbackRate={playbackRate}
					readerSurfaceRef={readerSurfaceRef}
					sections={sections}
					targetsBySection={targetsBySection}
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

function ReadListenPresence({
	ebookUuid,
	pairUuid,
}: {
	ebookUuid: string;
	pairUuid: string;
}) {
	useMountEffect(() => {
		const markActivity = () => {
			client.presence
				.markReadListenActivity({ pairUuid, ebookUuid })
				.catch(() => {});
		};
		markActivity();
		const interval = window.setInterval(markActivity, 30_000);
		return () => {
			window.clearInterval(interval);
			client.presence
				.clearActivity({ context: { keepalive: true } })
				.catch(() => {});
		};
	});

	return null;
}
