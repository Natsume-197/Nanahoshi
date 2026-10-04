import { onlineManager } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import type { NanahoshiAuth } from "./auth-client";

export type LastServer = { id: string; name: string; logo: string | null };

const keyFor = (serverUrl: string) =>
	`nanahoshi.last-server.${serverUrl.replace(/[^a-z0-9]/gi, "_")}`;

export function parseLastServer(text: string | null): LastServer | null {
	if (!text) return null;
	try {
		const value = JSON.parse(text) as Partial<LastServer>;
		if (typeof value.id !== "string" || typeof value.name !== "string")
			return null;
		return {
			id: value.id,
			name: value.name,
			logo: typeof value.logo === "string" ? value.logo : null,
		};
	} catch {
		return null;
	}
}

const cache = new Map<string, LastServer | null>();
const listeners = new Set<() => void>();

function read(serverUrl: string) {
	if (!cache.has(serverUrl))
		cache.set(
			serverUrl,
			parseLastServer(SecureStore.getItem(keyFor(serverUrl))),
		);
	return cache.get(serverUrl) ?? null;
}

type ActiveOrganization = {
	data?: { id: string; name: string; logo?: string | null } | null;
};

/** Offline, better-auth can't name the active server; keep the last one it
 * did so the header still can. Returns the cleanup for useMountEffect. */
export function rememberActiveServer(auth: NanahoshiAuth, serverUrl: string) {
	const atom = auth.$store.atoms.activeOrganization;
	return atom.subscribe((value: ActiveOrganization) => {
		const data = value.data;
		if (!data) return;
		const next = { id: data.id, name: data.name, logo: data.logo ?? null };
		const current = read(serverUrl);
		if (
			current?.id === next.id &&
			current.name === next.name &&
			current.logo === next.logo
		)
			return;
		cache.set(serverUrl, next);
		void SecureStore.setItemAsync(keyFor(serverUrl), JSON.stringify(next));
		for (const listener of listeners) listener();
	});
}

/** better-auth never retries what failed offline: back online, ask again for
 * the session and the active server. Returns the cleanup for useMountEffect. */
export function refetchAuthOnReconnect(auth: NanahoshiAuth) {
	let online = onlineManager.isOnline();
	return onlineManager.subscribe((next) => {
		if (next && !online) {
			auth.$store.notify("$sessionSignal");
			auth.$store.notify("$activeOrgSignal");
			auth.$store.notify("$listOrg");
		}
		online = next;
	});
}

export function useLastServer(serverUrl: string): LastServer | null {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => read(serverUrl),
	);
}
