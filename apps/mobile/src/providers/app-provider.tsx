import { QueryClientProvider } from "@tanstack/react-query";
import { createContext, type ReactNode, use, useRef, useState } from "react";
import { DownloadsProvider } from "@/downloads/provider";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { type Api, createApi, createQueryClient } from "@/lib/api";
import { createNanahoshiAuth, type NanahoshiAuth } from "@/lib/auth-client";
import { connectQueryLifecycle } from "@/lib/query-lifecycle";
import { readServerUrl, writeServerUrl } from "@/lib/server-url";
import { PlayerProvider } from "@/player/provider";

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
	const [queryClient] = useState(createQueryClient);
	const onUnauthorizedRef = useRef(() => {});
	const [connection] = useState(() => {
		if (!serverUrl) return null;
		const auth = createNanahoshiAuth(serverUrl);
		const api = createApi(serverUrl, auth, () => onUnauthorizedRef.current());
		return { serverUrl, auth, api };
	});
	onUnauthorizedRef.current = () => {
		connection?.auth.$store.notify("$sessionSignal");
	};

	return (
		<QueryClientProvider client={queryClient}>
			<ConnectionContext value={connection}>
				{/* Playback outlives every screen, so it lives with the connection. */}
				{connection ? (
					<PlayerProvider {...connection}>
						<DownloadsProvider {...connection}>{children}</DownloadsProvider>
					</PlayerProvider>
				) : (
					children
				)}
			</ConnectionContext>
		</QueryClientProvider>
	);
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
