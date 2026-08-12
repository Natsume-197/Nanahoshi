import { useQuery } from "@tanstack/react-query";
import { type RefObject, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MiniPlayer } from "@/components/audio-player/mini-player";
import {
	ActiveReadListenCue,
	LoadReadListenAudiobook,
	ReadListenSentenceSeeking,
	SeekReadListenFromText,
} from "@/components/read-listen/read-listen-bindings";
import type { BookReaderApi } from "@/components/reader/reader-shared-props";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import {
	createReadListenTimeline,
	findAdjacentReadListenCue,
	findReadListenCue,
	type ReadListenTimelineCue,
	toReaderSectionReference,
} from "@/lib/read-listen/timeline";
import type { ReaderSourceFormat, Section } from "@/lib/reader/types";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

const NIL_UUID = "00000000-0000-4000-8000-000000000000";

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
	const player = useAudioPlayerState();
	const { seekTo } = useAudioPlayerActions();
	const sessionQuery = useQuery(
		orpc.readListen.getSession.queryOptions({ input: { pairUuid, ebookUuid } }),
	);
	const audiobookUuid = sessionQuery.data?.pair.audiobookUuid;
	const detailsQuery = useQuery({
		...orpc.audiobooks.getDetails.queryOptions({
			input: { uuid: audiobookUuid ?? NIL_UUID },
		}),
		enabled: Boolean(audiobookUuid),
	});

	const timeline = useMemo(() => {
		const session = sessionQuery.data;
		const details = detailsQuery.data;
		if (!session || !details) return null;
		try {
			return createReadListenTimeline(
				session.alignment.cues,
				details.audioFiles ?? [],
			);
		} catch {
			return null;
		}
	}, [detailsQuery.data, sessionQuery.data]);
	const targetsBySection = useMemo(() => {
		const sections = new Map<
			string,
			Array<{
				anchor: ReadListenTimelineCue["text"];
				value: ReadListenTimelineCue;
			}>
		>();
		for (const cue of timeline ?? []) {
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
	const isAudiobookLoaded = player.audiobook?.uuid === audiobookUuid;
	const activeCue =
		isAudiobookLoaded && timeline
			? findReadListenCue(timeline, player.globalCurrentTime * 1000)
			: undefined;
	const alignmentRevision = sessionQuery.data?.alignment.createdAt ?? "pending";
	const previousCue =
		isAudiobookLoaded && timeline
			? findAdjacentReadListenCue(timeline, player.globalCurrentTime * 1000, -1)
			: undefined;
	const nextCue =
		isAudiobookLoaded && timeline
			? findAdjacentReadListenCue(timeline, player.globalCurrentTime * 1000, 1)
			: undefined;
	const repeatCue =
		activeCue ??
		(isAudiobookLoaded && timeline
			? findAdjacentReadListenCue(timeline, player.globalCurrentTime * 1000, -1)
			: undefined);

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

	const loading =
		sessionQuery.isLoading ||
		detailsQuery.isLoading ||
		(Boolean(audiobookUuid) && !isAudiobookLoaded);
	const unavailable =
		sessionQuery.isError || detailsQuery.isError || (!loading && !timeline);
	const currentText = unavailable
		? m["read_listen.reader_unavailable"]()
		: loading
			? m["read_listen.reader_loading"]()
			: activeCue?.text.kind === "text-quote"
				? activeCue.text.exact
				: m["read_listen.waiting_for_narration"]();

	return (
		<>
			{detailsQuery.data && (
				<LoadReadListenAudiobook
					key={detailsQuery.data.uuid}
					details={detailsQuery.data}
					isAudiobookLoaded={isAudiobookLoaded}
				/>
			)}
			{initialTextPosition !== undefined &&
				isInitialTextSeekPending &&
				isAudiobookLoaded &&
				timeline &&
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
			{activeCue && !isInitialTextSeekPending && (
				<ActiveReadListenCue
					key={`${alignmentRevision}:${sourceFormat}:${activeCue.id}:${followText}:${readerDomRevision}`}
					cue={activeCue}
					sectionTargets={
						targetsBySection.get(
							toReaderSectionReference(activeCue.text.sectionRef, sourceFormat),
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
								if (previousCue) seekTo(previousCue.globalStartMs / 1000);
							},
							canSeekNextSentence: Boolean(nextCue),
							onSeekNextSentence: () => {
								if (nextCue) seekTo(nextCue.globalStartMs / 1000);
							},
							canRepeatSentence: Boolean(repeatCue),
							onRepeatSentence: () => {
								if (repeatCue) seekTo(repeatCue.globalStartMs / 1000);
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
