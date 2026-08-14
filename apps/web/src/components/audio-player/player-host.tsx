import { useRouterState } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useState,
} from "react";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";
import { MiniPlayer } from "./mini-player";
import type { ReadListenPlayerContext } from "./read-listen-player";

type PublishReadListenContext = (
	context: ReadListenPlayerContext,
) => () => void;

const PlayerHostContext = createContext<PublishReadListenContext | null>(null);

export function PlayerHostProvider({ children }: { children: ReactNode }) {
	const placement = useRouterState({
		select: ({ location }) =>
			location.pathname.startsWith("/reader/") ? "reader" : "dashboard",
	});
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
			<MiniPlayer placement={placement} readListen={readListen} />
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
