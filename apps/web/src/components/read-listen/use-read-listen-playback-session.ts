import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import {
	createReadListenTimeline,
	type ReadListenTimelineCue,
	resolveReadListenTimelinePosition,
} from "@/lib/read-listen/timeline";
import { m } from "@/paraglide/messages";
import { type client, orpc } from "@/utils/orpc";

const NIL_UUID = "00000000-0000-4000-8000-000000000000";

export type ReadListenPlaybackSession = {
	status: "empty" | "loading" | "ready" | "unavailable";
	statusText: string;
	details: Awaited<ReturnType<typeof client.audiobooks.getDetails>> | null;
	timeline: ReadListenTimelineCue[];
	activeCue: ReadListenTimelineCue | undefined;
	activeCueIndex: number;
	previousCue: ReadListenTimelineCue | undefined;
	nextCue: ReadListenTimelineCue | undefined;
	repeatCue: ReadListenTimelineCue | undefined;
	isAudiobookLoaded: boolean;
	alignmentRevision: string;
	seekToCue: (cue: ReadListenTimelineCue) => void;
	retry: () => void;
};

/** Playback-facing seam shared by the reader DOM and synchronized-text views. */
export function useReadListenPlaybackSession({
	pairUuid,
	ebookUuid,
}: {
	pairUuid: string;
	ebookUuid: string;
}): ReadListenPlaybackSession {
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

	const timelineResult = useMemo(() => {
		const session = sessionQuery.data;
		const details = detailsQuery.data;
		if (!session || !details) return { timeline: [], invalid: false };
		try {
			return {
				timeline: createReadListenTimeline(
					session.alignment.cues,
					details.audioFiles ?? [],
				),
				invalid: false,
			};
		} catch {
			return { timeline: [], invalid: true };
		}
	}, [detailsQuery.data, sessionQuery.data]);
	const { timeline } = timelineResult;
	const isAudiobookLoaded = player.audiobook?.uuid === audiobookUuid;
	const position =
		isAudiobookLoaded && timeline.length > 0
			? resolveReadListenTimelinePosition(
					timeline,
					player.globalCurrentTime * 1000,
				)
			: {
					activeIndex: -1,
					activeCue: undefined,
					previousCue: undefined,
					nextCue: undefined,
				};
	const activeCueIndex = position.activeIndex;
	const { activeCue, previousCue, nextCue } = position;
	const repeatCue = activeCue ?? previousCue;
	const loading =
		sessionQuery.isLoading ||
		detailsQuery.isLoading ||
		(Boolean(audiobookUuid) && !isAudiobookLoaded);
	const unavailable =
		sessionQuery.isError || detailsQuery.isError || timelineResult.invalid;
	const empty = !loading && !unavailable && timeline.length === 0;
	const status = unavailable
		? "unavailable"
		: loading
			? "loading"
			: empty
				? "empty"
				: "ready";
	const statusText = unavailable
		? m["read_listen.reader_unavailable"]()
		: loading
			? m["read_listen.reader_loading"]()
			: empty
				? m["read_listen.synchronized_text_unavailable"]()
				: activeCue?.text.kind === "text-quote"
					? activeCue.text.exact
					: m["read_listen.waiting_for_narration"]();

	const seekToCue = useCallback(
		(cue: ReadListenTimelineCue) => seekTo(cue.globalStartMs / 1000),
		[seekTo],
	);
	const retry = useCallback(() => {
		const requests: Promise<unknown>[] = [sessionQuery.refetch()];
		if (audiobookUuid) requests.push(detailsQuery.refetch());
		void Promise.all(requests);
	}, [audiobookUuid, detailsQuery.refetch, sessionQuery.refetch]);

	return {
		status,
		statusText,
		details: detailsQuery.data ?? null,
		timeline,
		activeCue,
		activeCueIndex,
		previousCue,
		nextCue,
		repeatCue,
		isAudiobookLoaded,
		alignmentRevision: sessionQuery.data?.alignment.createdAt ?? "pending",
		seekToCue,
		retry,
	};
}
