import { useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	use,
	useState,
	useSyncExternalStore,
} from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import type { Api } from "@/lib/api";
import type { NanahoshiAuth } from "@/lib/auth-client";
import { PlayerEngine, type PlayerSnapshot } from "./engine";

const PlayerContext = createContext<PlayerEngine | null>(null);

/** One engine per server connection, alive for as long as the app is. */
export function PlayerProvider({
	serverUrl,
	auth,
	api,
	children,
}: {
	serverUrl: string;
	auth: NanahoshiAuth;
	api: Api;
	children: ReactNode;
}) {
	const queryClient = useQueryClient();
	const [engine] = useState(
		() => new PlayerEngine({ serverUrl, auth, api, queryClient }),
	);
	useMountEffect(() => engine.attach());
	return <PlayerContext value={engine}>{children}</PlayerContext>;
}

export function usePlayer(): PlayerEngine {
	const engine = use(PlayerContext);
	if (!engine) throw new Error("usePlayer must be used inside PlayerProvider");
	return engine;
}

/** Subscribe to one slice; the component re-renders only when it changes.
 * Select primitives or references the engine keeps stable (like `book`). */
export function usePlayerState<T>(select: (snapshot: PlayerSnapshot) => T): T {
	const engine = usePlayer();
	return useSyncExternalStore(engine.subscribe, () =>
		select(engine.getSnapshot()),
	);
}
