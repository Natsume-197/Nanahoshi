import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { type CSSProperties, memo, useMemo, useRef, useState } from "react";
import {
	ExpandedPlayer,
	type PlayerSidePanelMode,
} from "@/components/audio-player/expanded-player";
import { miniPlayerBarLayer } from "@/components/audio-player/mini-player-motion";
import { PlayerBar } from "@/components/audio-player/player-bar";
import type { ReadListenPlayerContext } from "@/components/audio-player/read-listen-player";
import { usePlayerShortcuts } from "@/components/audio-player/use-player-shortcuts";
import { useReadListenReaderPrefetch } from "@/components/audio-player/use-read-listen-reader-prefetch";
import { useSheetDrag } from "@/components/audio-player/use-sheet-drag";
import {
	useAudioPlayerActions,
	useAudioPlayerBook,
	useAudioPlayerExpanded,
} from "@/context/audio-player-context";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useOverlayBackDismiss } from "@/hooks/use-overlay-back-dismiss";
import { findReadyReadListenPairing } from "@/lib/read-listen/pairing";
import {
	navigateToReadListenReader,
	rememberReadListenReaderEntry,
} from "@/lib/read-listen/reader-session";
import { transitionReadListenNavigation } from "@/lib/read-listen/view-transition";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

function PlayerShortcuts() {
	usePlayerShortcuts();
	return null;
}

/** Moves focus into the panel on open and hands it back to the trigger on close. */
function FocusScope({
	container,
}: {
	container: React.RefObject<HTMLElement | null>;
}) {
	useMountEffect(() => {
		const previous = document.activeElement;
		container.current?.querySelector("button")?.focus();
		return () => {
			if (previous instanceof HTMLElement) previous.focus();
		};
	});
	return null;
}

/** Mounts once per open, so opening can undo what a swipe left behind. */
function OnOpen({ run }: { run: () => void }) {
	useMountEffect(run);
	return null;
}

/** Stops the viewport overscroll gesture from reaching browser refresh. */
function DisablePullToRefresh() {
	useMountEffect(() => {
		document.documentElement.classList.add("expanded-player-open");
		return () => {
			document.documentElement.classList.remove("expanded-player-open");
		};
	});
	return null;
}

function readerPlayerThemeStyle(
	readListen: ReadListenPlayerContext | undefined,
): CSSProperties {
	const readerTheme = readListen?.readerTheme;
	if (!readerTheme) return {};
	const mix = (percentage: number) =>
		`color-mix(in oklab, ${readerTheme.fontColor} ${percentage}%, ${readerTheme.backgroundColor})`;
	return {
		"--background": readerTheme.backgroundColor,
		"--foreground": readerTheme.fontColor,
		"--card": readerTheme.backgroundColor,
		"--card-foreground": readerTheme.fontColor,
		"--muted": mix(8),
		"--muted-foreground": mix(62),
		"--accent": mix(10),
		"--accent-foreground": readerTheme.fontColor,
		"--border": mix(14),
		"--ring": mix(55),
		"--sidebar": readerTheme.backgroundColor,
		"--sidebar-foreground": readerTheme.fontColor,
		"--sidebar-border": mix(14),
	} as CSSProperties;
}

export const MiniPlayer = memo(function MiniPlayer({
	placement = "dashboard",
	readListen,
}: {
	placement?: "dashboard" | "reader";
	readListen?: ReadListenPlayerContext;
}) {
	const audiobook = useAudioPlayerBook();
	const isExpanded = useAudioPlayerExpanded();
	const { getGlobalCurrentTime, setExpanded } = useAudioPlayerActions();
	const navigate = useNavigate();
	const router = useRouter();
	const [sidePanel, setSidePanel] = useState<PlayerSidePanelMode>(null);
	const sidePanelBookRef = useRef(audiobook?.uuid);
	if (audiobook?.uuid !== sidePanelBookRef.current) {
		sidePanelBookRef.current = audiobook?.uuid;
		setSidePanel(null);
	}
	const pairingsQuery = useQuery({
		...orpc.readListen.getPairings.queryOptions({
			input: {
				publicationUuid:
					audiobook?.uuid ?? "00000000-0000-4000-8000-000000000000",
			},
		}),
		enabled: Boolean(audiobook) && !readListen,
	});
	const readyPairing = findReadyReadListenPairing(pairingsQuery.data?.pairings);
	const readerTarget = useMemo(
		() =>
			readyPairing
				? {
						ebookUuid: readyPairing.ebook.uuid,
						pairUuid: readyPairing.id,
					}
				: undefined,
		[readyPairing],
	);
	const readerPrefetch = useReadListenReaderPrefetch(readerTarget);
	const openReadListenReader =
		readyPairing && audiobook
			? () => {
					readerPrefetch.prepare();
					rememberReadListenReaderEntry({
						pairUuid: readyPairing.id,
						ebookUuid: readyPairing.ebook.uuid,
						audiobookUuid: audiobook.uuid,
						originHref: router.latestLocation.href,
						originHistoryIndex:
							router.latestLocation.state.__TSR_index ??
							router.history.location.state.__TSR_index,
						playheadSeconds: getGlobalCurrentTime(),
					});
					void transitionReadListenNavigation({
						direction: "enter",
						update: async () => {
							setExpanded(false);
							await navigateToReadListenReader({
								navigate: (options) => navigate(options),
								ebookUuid: readyPairing.ebook.uuid,
								pairUuid: readyPairing.id,
							});
						},
					});
				}
			: undefined;
	const panelRef = useRef<HTMLDivElement>(null);
	const drag = useSheetDrag({
		panelRef,
		enabled: isExpanded,
		onDismiss: () => setExpanded(false),
	});
	useOverlayBackDismiss(isExpanded, () => setExpanded(false));

	// The panel stays mounted so the open transition has a painted start state;
	// its contents don't, or they'd re-render on every playback tick unseen.
	const [hasContent, setHasContent] = useState(false);
	if (isExpanded && !hasContent) setHasContent(true);

	if (!audiobook) return null;

	return (
		<>
			<PlayerShortcuts />
			{isExpanded && <DisablePullToRefresh />}
			<div
				data-player-expanded={isExpanded}
				className={cn(
					"read-listen-player-dock fixed inset-x-0 text-sidebar-foreground md:bottom-0",
					miniPlayerBarLayer(isExpanded, hasContent),
					placement === "reader"
						? "bottom-[var(--safe-area-bottom)] after:pointer-events-none after:absolute after:inset-y-0 after:left-full after:w-8 after:bg-sidebar after:content-[''] md:after:bg-card"
						: "bottom-[calc(var(--mobile-tabbar-height)+var(--safe-area-bottom))]",
				)}
				style={
					{
						...readerPlayerThemeStyle(readListen),
						"--player-height": "88px",
						"--player-reserve":
							"calc(var(--player-height) + var(--safe-area-bottom))",
					} as CSSProperties
				}
			>
				<PlayerBar
					readListen={readListen}
					onOpenReadListen={openReadListenReader}
					onReadListenIntent={readerPrefetch.warm}
					onReadListenCommitIntent={readerPrefetch.prepare}
					showStopButton={placement !== "reader"}
				/>
			</div>

			<div
				ref={panelRef}
				data-expanded={isExpanded}
				role="dialog"
				aria-modal="true"
				aria-label={m["audiobook.player_now_playing"]()}
				inert={!isExpanded}
				onPointerDown={drag.onPointerDown}
				onPointerMove={drag.onPointerMove}
				onPointerUp={drag.onPointerUp}
				onPointerCancel={drag.onPointerCancel}
				onTransitionEnd={(event) => {
					if (
						event.target !== event.currentTarget ||
						(event.propertyName !== "transform" &&
							event.propertyName !== "opacity")
					) {
						return;
					}
					drag.clearInlineStyles();
					if (!isExpanded) setHasContent(false);
				}}
				// z-40 keeps it under the popup layer, so popovers open over it. Opening
				// is the deliberate action and gets the longer curve.
				className={cn(
					"expanded-player-sheet fixed inset-0 z-40 overflow-hidden bg-background",
				)}
			>
				{/* Reopening mid-dismissal: dropping the swipe's leftover transform
				    lets it slide back up from wherever it had got to. */}
				{isExpanded && <OnOpen run={drag.clearInlineStyles} />}
				{isExpanded && <FocusScope container={panelRef} />}
				{hasContent && (
					<ExpandedPlayer
						readListen={readListen}
						onOpenReadListenReader={openReadListenReader}
						onReadListenIntent={readerPrefetch.warm}
						onReadListenCommitIntent={readerPrefetch.prepare}
						sidePanel={sidePanel}
						onSidePanelChange={setSidePanel}
					/>
				)}
			</div>
		</>
	);
});
