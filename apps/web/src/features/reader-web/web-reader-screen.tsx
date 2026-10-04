import { ebookSourceFormatForFilename } from "@nanahoshi/api/modules/scanning/supportedExtensions";
import { findReadyReadListenPairing } from "@nanahoshi/reader/read-listen/pairing";
import {
	loadReadListenReaderSession,
	navigateReadListenReaderMode,
	planReadListenReaderExit,
} from "@nanahoshi/reader/read-listen/reader-session";
import { useReadListenMode } from "@nanahoshi/reader/read-listen/use-read-listen-mode";
import {
	ReaderScreen,
	type ReaderScreenBook,
} from "@nanahoshi/reader/reader-screen";
import { resolveReaderServerId } from "@nanahoshi/reader/session/reader-server-id";
import { ReaderLoadingScreen } from "@nanahoshi/reader/ui/chrome/reader-loading-screen";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { shouldReserveReaderPlayerSpace } from "@/components/audio-player/player-route-visibility";
import {
	useAudioPlayerActions,
	useAudioPlayerBook,
	useAudioPlayerExpanded,
} from "@/context/audio-player-context";
import { usePresenceEvents } from "@/hooks/use-presence-events";
import { useSyncActiveOrg } from "@/hooks/use-sync-active-org";
import { authClient } from "@/lib/auth-client";
import { transitionReadListenNavigation } from "@/lib/read-listen/view-transition";
import { orpc } from "@/utils/orpc";

export function ReaderRoutePending() {
	const audioPlayerBook = useAudioPlayerBook();
	const readListenActive = useRouterState({
		select: ({ location }) =>
			Boolean((location.search as { pair?: string }).pair),
	});
	return (
		<ReaderLoadingScreen
			state={{ phase: "loading" }}
			entering
			reservePlayerSpace={shouldReserveReaderPlayerSpace(
				readListenActive,
				Boolean(audioPlayerBook),
			)}
		/>
	);
}

/** The reader inside the web app: org, presence, audio player and Read & Listen. */
export function WebReaderScreen({
	book,
	switchedOrgId,
	uuid,
	userId,
	sessionServerId,
	readListenPairUuid,
}: {
	book: ReaderScreenBook | null | undefined;
	switchedOrgId: string | null | undefined;
	uuid: string;
	userId: string;
	/** The session's active server, known before the auth org store loads. */
	sessionServerId?: string | null;
	readListenPairUuid?: string;
}) {
	const navigate = useNavigate();
	const router = useRouter();
	const isAudioPlayerExpanded = useAudioPlayerExpanded();
	const audioPlayerBook = useAudioPlayerBook();
	const { stop } = useAudioPlayerActions();
	const reservePlayerSpace = shouldReserveReaderPlayerSpace(
		Boolean(readListenPairUuid),
		Boolean(audioPlayerBook),
	);
	const pairingsQuery = useQuery(
		orpc.readListen.getPairings.queryOptions({
			input: { publicationUuid: uuid },
		}),
	);
	const readyPairing = findReadyReadListenPairing(pairingsQuery.data?.pairings);
	const isPdfBook =
		!!book?.filename && ebookSourceFormatForFilename(book.filename) === "pdf";
	const readListen = useReadListenMode({
		uuid,
		pairUuid: readListenPairUuid,
		readyPairUuid: readyPairing?.id,
		available: Boolean(!isPdfBook && (readListenPairUuid || readyPairing)),
		stopAudio: stop,
		enterMode: (pairUuid) =>
			navigateReadListenReaderMode({
				navigate: (options) => navigate(options),
				uuid,
				pairUuid,
			}),
		leaveMode: () =>
			navigateReadListenReaderMode({
				navigate: (options) => navigate(options),
				uuid,
			}),
		// Back to wherever Read & Listen was started from (the audiobook, or
		// the book's page), with the web's view transition.
		exitReadListen: () =>
			transitionReadListenNavigation({
				direction: "exit",
				update: async () => {
					const plan = planReadListenReaderExit({
						session: readListenPairUuid
							? loadReadListenReaderSession({ pairUuid: readListenPairUuid })
							: undefined,
						currentHistoryIndex:
							router.latestLocation.state.__TSR_index ??
							router.history.location.state.__TSR_index,
						fallbackAudiobookUuid: audioPlayerBook?.uuid,
						fallbackEbookUuid: uuid,
					});
					if (plan.type === "back") {
						await new Promise<void>((resolve) => {
							const unsubscribe = router.subscribe("onResolved", () => {
								unsubscribe();
								resolve();
							});
							router.history.back();
						});
						return;
					}
					await router.navigate({ href: plan.href });
				},
			}),
	});

	useSyncActiveOrg(switchedOrgId);
	// The reader is a full-page route outside DashboardLayout, so it would
	// otherwise drop the presence connection mid-read. Keeping the socket open
	// here holds them "online" (and "reading" via the sync).
	usePresenceEvents();

	const { data: activeOrg, isPending: activeOrgPending } =
		authClient.useActiveOrganization();
	const serverId = resolveReaderServerId({
		switchedOrgId,
		activeOrgId: activeOrg?.id,
		activeOrgPending,
		sessionServerId,
	});

	const openBookDetail = () =>
		navigate({ to: "/dashboard/books/$uuid", params: { uuid } });
	const exitReader = () => {
		readListen.clearEntry();
		if (!readListenPairUuid) {
			void openBookDetail();
			return;
		}
		void transitionReadListenNavigation({
			direction: "exit",
			update: openBookDetail,
		});
	};

	return (
		<ReaderScreen
			book={book}
			uuid={uuid}
			userId={userId}
			serverId={serverId}
			onExit={exitReader}
			onBookCompleted={openBookDetail}
			reservePlayerSpace={reservePlayerSpace}
			playerExpanded={isAudioPlayerExpanded}
			readListen={readListen}
		/>
	);
}
