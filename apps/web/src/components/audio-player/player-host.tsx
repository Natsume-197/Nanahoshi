import { useRouterState } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useState,
} from "react";
import { useAudioPlayerActions } from "@/context/audio-player-context";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { MiniPlayer } from "./mini-player";
import type { ReadListenPlayerContext } from "./read-listen-player";

type PublishReadListenContext = (
	context: ReadListenPlayerContext,
) => () => void;

const PlayerHostContext = createContext<PublishReadListenContext | null>(null);

/** Pauses playback while settings pages hide the mini player. */
function PausePlaybackWhileHidden() {
	const { pause } = useAudioPlayerActions();
	useMountEffect(() => {
		pause();
	});
	return null;
}

/**
 * Routes where the mini player must not mount: app settings, server
 * settings, and logged-out pages. The dashboard layout reuses this so its
 * bottom-chrome reserve collapses on the same routes instead of leaving an
 * empty row where the bar would be.
 */
export function isPlayerHiddenRoute(pathname: string): boolean {
	return /^\/(?:dashboard\/(?:settings|server)|login|sign-up)(?:\/|$)/.test(
		pathname,
	);
}

export function PlayerHostProvider({ children }: { children: ReactNode }) {
	const pathname = useRouterState({
		select: ({ location }) => location.pathname,
	});
	const placement = pathname.startsWith("/reader/") ? "reader" : "dashboard";
	const hidePlayer = isPlayerHiddenRoute(pathname);
	const [readListen, setReadListen] = useState<ReadListenPlayerContext>();
	const publishReadListen = useCallback<PublishReadListenContext>((context) => {
		setReadListen(context);
		return () => {
			setReadListen((current) => (current === context ? undefined : current));
		};
	}, []);

	return (
		<PlayerHostContext value={publishReadListen}>
			{children}
			{hidePlayer ? (
				<PausePlaybackWhileHidden />
			) : (
				<MiniPlayer placement={placement} readListen={readListen} />
			)}
		</PlayerHostContext>
	);
}

/** Publishes reader-only controls to the persistent player without owning it. */
export function PlayerHostReadListenBridge({
	context,
}: {
	context: ReadListenPlayerContext;
}) {
	const publish = useContext(PlayerHostContext);
	if (!publish) {
		throw new Error(
			"PlayerHostReadListenBridge must be rendered inside PlayerHostProvider",
		);
	}

	useIsomorphicLayoutEffect(() => publish(context), [context, publish]);
	return null;
}
