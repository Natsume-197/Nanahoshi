import { memo, useRef, useState } from "react";
import { ExpandedPlayer } from "@/components/audio-player/expanded-player";
import { PlayerBar } from "@/components/audio-player/player-bar";
import { usePlayerShortcuts } from "@/components/audio-player/use-player-shortcuts";
import { useSheetDrag } from "@/components/audio-player/use-sheet-drag";
import {
	useAudioPlayerActions,
	useAudioPlayerBook,
	useAudioPlayerExpanded,
} from "@/context/audio-player-context";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

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

export const MiniPlayer = memo(function MiniPlayer() {
	const audiobook = useAudioPlayerBook();
	const isExpanded = useAudioPlayerExpanded();
	const { setExpanded } = useAudioPlayerActions();
	const panelRef = useRef<HTMLDivElement>(null);
	const drag = useSheetDrag({
		panelRef,
		enabled: isExpanded,
		onDismiss: () => setExpanded(false),
	});

	// The panel stays mounted so the open transition has a painted start state;
	// its contents don't, or they'd re-render on every playback tick unseen.
	const [hasContent, setHasContent] = useState(false);
	if (isExpanded && !hasContent) setHasContent(true);

	if (!audiobook) return null;

	return (
		<>
			<PlayerShortcuts />
			<div className="fixed inset-x-0 bottom-[calc(var(--mobile-tabbar-height)+var(--safe-area-bottom))] z-40 text-sidebar-foreground md:bottom-0">
				<PlayerBar />
			</div>

			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-label={m["audiobook.player_now_playing"]()}
				inert={!isExpanded}
				onPointerDown={drag.onPointerDown}
				onPointerMove={drag.onPointerMove}
				onPointerUp={drag.onPointerUp}
				onPointerCancel={drag.onPointerCancel}
				onTransitionEnd={(event) => {
					// `translate-y-*` animates the `translate` property, not `transform`.
					if (
						event.target !== event.currentTarget ||
						event.propertyName !== "translate"
					) {
						return;
					}
					drag.clearInlineStyles();
					if (!isExpanded) setHasContent(false);
				}}
				// z-40 keeps it under the popup layer, so popovers open over it. Opening
				// is the deliberate action and gets the longer curve.
				className={cn(
					"fixed inset-0 z-40 overflow-hidden bg-background transition-transform ease-[var(--ease-smooth-out)]",
					isExpanded
						? "translate-y-0 duration-[380ms]"
						: "pointer-events-none translate-y-full duration-[280ms]",
				)}
			>
				{/* Reopening mid-dismissal: dropping the swipe's leftover transform
				    lets it slide back up from wherever it had got to. */}
				{isExpanded && <OnOpen run={drag.clearInlineStyles} />}
				{isExpanded && <FocusScope container={panelRef} />}
				{hasContent && <ExpandedPlayer />}
			</div>
		</>
	);
});
