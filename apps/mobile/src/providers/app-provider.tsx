import { onlineManager, QueryClientProvider } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	use,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { AppState } from "react-native";
import { DownloadsProvider } from "@/downloads/provider";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { type Api, createApi, createQueryClient } from "@/lib/api";
import { createNanahoshiAuth, type NanahoshiAuth } from "@/lib/auth-client";
import { pingServer } from "@/lib/discover-servers";
import {
	refetchAuthOnReconnect,
	rememberActiveServer,
} from "@/lib/last-server";
import { connectQueryLifecycle } from "@/lib/query-lifecycle";
import { restoreSavedQueries } from "@/lib/query-persist";
import {
	createServerReachability,
	type ServerReachability,
} from "@/lib/server-reachability";
import { readServerUrl, writeServerUrl } from "@/lib/server-url";
import { installNetworkGuard } from "@/lib/simulated-offline";
import { PlayerProvider } from "@/player/provider";

installNetworkGuard();

type ServerContextValue = {
	serverUrl: string | null;
	setServerUrl: (url: string | null) => Promise<void>;
};

type ConnectionContextValue = {
	serverUrl: string;
	auth: NanahoshiAuth;
	api: Api;
};

const ServerContext = createContext<ServerContextValue | null>(null);
const ConnectionContext = createContext<ConnectionContextValue | null>(null);
const ReachabilityContext = createContext<ServerReachability | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
	const [serverUrl, setServerUrlState] = useState(readServerUrl);
	useMountEffect(connectQueryLifecycle);

	const setServerUrl = async (url: string | null) => {
		await writeServerUrl(url);
		setServerUrlState(url);
	};

	return (
		<ServerContext value={{ serverUrl, setServerUrl }}>
			{/* A new server is a new world: fresh auth client, API client and
			    query cache, so nothing from the previous server can leak in. */}
			<Connection key={serverUrl ?? "none"} serverUrl={serverUrl}>
				{children}
			</Connection>
		</ServerContext>
	);
}

function Connection({
	serverUrl,
	children,
}: {
	serverUrl: string | null;
	children: ReactNode;
}) {
	// A cold start draws the screens it saw last time while they refetch.
	const [queryClient] = useState(() => {
		const client = createQueryClient();
		if (serverUrl) restoreSavedQueries(client, serverUrl);
		return client;
	});
	const onUnauthorizedRef = useRef(() => {});
	const [reachability] = useState(() =>
		serverUrl
			? createServerReachability({
					probe: () => pingServer(serverUrl),
					// Screens that failed while it was gone load again on their own.
					onRecovered: () =>
						void queryClient.refetchQueries({ type: "active" }),
				})
			: null,
	);
	const [connection] = useState(() => {
		if (!serverUrl || !reachability) return null;
		const auth = createNanahoshiAuth(serverUrl);
		const api = createApi(
			serverUrl,
			auth,
			() => onUnauthorizedRef.current(),
			reachability,
		);
		return { serverUrl, auth, api };
	});
	onUnauthorizedRef.current = () => {
		connection?.auth.$store.notify("$sessionSignal");
	};

	return (
		<QueryClientProvider client={queryClient}>
			<ConnectionContext value={connection}>
				<ReachabilityContext value={reachability}>
					{/* Playback outlives every screen, so it lives with the connection. */}
					{connection && reachability ? (
						<PlayerProvider {...connection}>
							<RememberActiveServer {...connection} />
							<WatchServer reachability={reachability} />
							<DownloadsProvider {...connection}>{children}</DownloadsProvider>
						</PlayerProvider>
					) : (
						children
					)}
				</ReachabilityContext>
			</ConnectionContext>
		</QueryClientProvider>
	);
}

function RememberActiveServer({
	auth,
	serverUrl,
}: {
	auth: NanahoshiAuth;
	serverUrl: string;
}) {
	useMountEffect(() => {
		const forget = rememberActiveServer(auth, serverUrl);
		const stopRefetching = refetchAuthOnReconnect(auth);
		return () => {
			forget();
			stopRefetching();
		};
	});
	return null;
}

/** Asks the server on start, and again when the phone comes back online or
 * to the foreground while it was gone; API requests report the rest. */
function WatchServer({ reachability }: { reachability: ServerReachability }) {
	useMountEffect(() => {
		void reachability.check();
		const online = onlineManager.subscribe((isOnline) => {
			if (isOnline) void reachability.check();
		});
		const foreground = AppState.addEventListener("change", (status) => {
			if (status === "active" && reachability.status() === "unreachable")
				void reachability.check();
		});
		return () => {
			online();
			foreground.remove();
			reachability.stop();
		};
	});
	return null;
}

export type ServerStatus = {
	status: "unknown" | "reachable" | "unreachable";
	/** Resolves with whether the server answered. */
	check: () => Promise<boolean>;
};

/** Whether the server answers; "reachable" outside a connection. */
export function useServerStatus(): ServerStatus {
	const reachability = use(ReachabilityContext);
	const status = useSyncExternalStore(
		(listener) => reachability?.subscribe(listener) ?? (() => {}),
		() => reachability?.status() ?? "reachable",
	);
	return {
		status,
		check: () => reachability?.check() ?? Promise.resolve(true),
	};
}

export function useServer() {
	const value = use(ServerContext);
	if (!value) throw new Error("useServer must be used inside AppProvider");
	return value;
}

/** Only for screens behind the signed-in guard, where a server always exists. */
export function useConnection() {
	const value = use(ConnectionContext);
	if (!value) throw new Error("No server connection");
	return value;
}

export function useMaybeConnection() {
	return use(ConnectionContext);
}

export function useApi() {
	return useConnection().api;
}
