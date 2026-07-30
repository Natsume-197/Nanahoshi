import { memo, useRef, useState } from "react";
import { ExpandedPlayer } from "@/components/audio-player/expanded-player";
import { PlayerBar } from "@/components/audio-player/player-bar";
import { usePlayerShortcuts } from "@/components/audio-player/use-player-shortcuts";
import {
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

export const MiniPlayer = memo(function MiniPlayer() {
	const audiobook = useAudioPlayerBook();
	const isExpanded = useAudioPlayerExpanded();
	const panelRef = useRef<HTMLDivElement>(null);

	// The panel itself stays mounted so the open transition has a painted start
	// state; its contents come and go, since an invisible now-playing tree would
	// re-render on every playback tick.
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
				onTransitionEnd={(event) => {
					if (
						event.target === event.currentTarget &&
						event.propertyName === "transform" &&
						!isExpanded
					) {
						setHasContent(false);
					}
				}}
				// z-40 keeps it under every popup layer (z-50), so the speed and sleep
				// popovers still open over it.
				className={cn(
					"fixed inset-0 z-40 overflow-hidden bg-background pt-[var(--safe-area-top)] pr-[var(--safe-area-right)] pb-[var(--safe-area-bottom)] pl-[var(--safe-area-left)] transition-[transform,opacity] duration-300 ease-[var(--ease-out-quart)]",
					isExpanded
						? "translate-y-0 opacity-100"
						: "pointer-events-none translate-y-full opacity-0",
				)}
			>
				{isExpanded && <FocusScope container={panelRef} />}
				{hasContent && <ExpandedPlayer />}
			</div>
		</>
	);
});
