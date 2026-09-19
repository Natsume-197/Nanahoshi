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
import { isPlayerHiddenRoute } from "./player-route-visibility";
import type { ReadListenPlayerContext } from "./read-listen-player";

export { isPlayerHiddenRoute } from "./player-route-visibility";

type PublishReadListenContext = (
	context: ReadListenPlayerContext,
) => () => void;

const PlayerHostContext = createContext<PublishReadListenContext | null>(null);

/** Suspends playback while the current route hides the mini player. */
function PausePlaybackWhileHidden() {
	const { pause, setExpanded } = useAudioPlayerActions();
	useMountEffect(() => {
		pause();
		setExpanded(false);
	});
	return null;
}

export function PlayerHostProvider({ children }: { children: ReactNode }) {
	const pathname = useRouterState({
		select: ({ location }) => location.pathname,
	});
	const readListenActive = useRouterState({
		select: ({ location }) =>
			Boolean((location.search as { pair?: string }).pair),
	});
	const placement = pathname.startsWith("/reader/") ? "reader" : "dashboard";
	const hidePlayer = isPlayerHiddenRoute(pathname, readListenActive);
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
