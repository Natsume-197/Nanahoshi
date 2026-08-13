import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type CSSProperties, memo, useRef, useState } from "react";
import {
	ExpandedPlayer,
	type PlayerSidePanelMode,
} from "@/components/audio-player/expanded-player";
import { miniPlayerBarLayer } from "@/components/audio-player/mini-player-motion";
import { PlayerBar } from "@/components/audio-player/player-bar";
import type { PlayerReadListenPairing } from "@/components/audio-player/player-read-listen-panel";
import type { ReadListenPlayerContext } from "@/components/audio-player/read-listen-player";
import { usePlayerShortcuts } from "@/components/audio-player/use-player-shortcuts";
import { useSheetDrag } from "@/components/audio-player/use-sheet-drag";
import {
	useAudioPlayerActions,
	useAudioPlayerBook,
	useAudioPlayerExpanded,
} from "@/context/audio-player-context";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useOverlayBackDismiss } from "@/hooks/use-overlay-back-dismiss";
import {
	findReadyReadListenPairings,
	resolveReadListenPairingChoice,
} from "@/lib/read-listen/pairing";
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

export const MiniPlayer = memo(function MiniPlayer({
	placement = "dashboard",
	readListen,
}: {
	placement?: "dashboard" | "reader";
	readListen?: ReadListenPlayerContext;
}) {
	const audiobook = useAudioPlayerBook();
	const isExpanded = useAudioPlayerExpanded();
	const { setExpanded } = useAudioPlayerActions();
	const navigate = useNavigate();
	const [sidePanel, setSidePanel] = useState<PlayerSidePanelMode>(null);
	const [selectedPairingId, setSelectedPairingId] = useState<string | null>(
		null,
	);
	const sidePanelBookRef = useRef(audiobook?.uuid);
	if (audiobook?.uuid !== sidePanelBookRef.current) {
		sidePanelBookRef.current = audiobook?.uuid;
		setSidePanel(null);
		setSelectedPairingId(null);
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
	const readyPairings = findReadyReadListenPairings(
		pairingsQuery.data?.pairings,
	);
	const playerPairings: PlayerReadListenPairing[] = readyPairings.map(
		(pairing) => ({
			id: pairing.id,
			ebookUuid: pairing.ebook.uuid,
			ebookTitle: pairing.ebook.title,
			ebookFilename: pairing.ebook.filename,
		}),
	);
	const selectedPairing = resolveReadListenPairingChoice(
		playerPairings,
		selectedPairingId,
	);
	const resolvedSidePanel =
		sidePanel === "read-listen" && playerPairings.length === 0
			? null
			: sidePanel;
	const showReadListen =
		playerPairings.length > 0
			? () => {
					setSidePanel("read-listen");
					setExpanded(true);
				}
			: undefined;
	const openReadListenReader = (pairing: PlayerReadListenPairing) => {
		setExpanded(false);
		void navigate({
			to: "/reader/$uuid",
			params: { uuid: pairing.ebookUuid },
			search: { pair: pairing.id },
		});
	};
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
			<div
				className={cn(
					"fixed inset-x-0 text-sidebar-foreground md:bottom-0",
					miniPlayerBarLayer(isExpanded, hasContent),
					placement === "reader"
						? "bottom-[var(--safe-area-bottom)]"
						: "bottom-[calc(var(--mobile-tabbar-height)+var(--safe-area-bottom))]",
				)}
				style={
					placement === "reader"
						? ({
								"--player-height": "88px",
								"--player-reserve":
									"calc(var(--player-height) + var(--safe-area-bottom))",
							} as CSSProperties)
						: undefined
				}
			>
				<PlayerBar
					readListen={readListen}
					onOpenReadListen={showReadListen}
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
						readListenPairings={playerPairings}
						selectedReadListenPairingId={selectedPairing?.id ?? null}
						onReadListenPairingChange={setSelectedPairingId}
						onOpenReadListenReader={openReadListenReader}
						sidePanel={resolvedSidePanel}
						onSidePanelChange={setSidePanel}
					/>
				)}
			</div>
		</>
	);
});
