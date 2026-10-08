import type { ReaderBootScreen } from "@nanahoshi/reader-bridge";
import { useQuery } from "@tanstack/react-query";
import { type Href, useNavigation } from "expo-router";
import {
	createContext,
	type ReactNode,
	type RefObject,
	use,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { StyleSheet } from "react-native";
import { Portal, PortalHost } from "react-native-teleport";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { EmbedWebView, type ReaderWebViewHandle } from "./embed-webview";
import { readerPageQuery } from "./reader-page";

const STANDBY_HOST = "reader-standby";

type PoolState = { host: string | null; visible: boolean; warm: boolean };
const noop = (_next?: Href) => {};

function createPool() {
	let state: PoolState = { host: null, visible: false, warm: false };
	const listeners = new Set<() => void>();
	const set = (next: Partial<PoolState>) => {
		state = { ...state, ...next };
		for (const listener of listeners) listener();
	};
	const handle: RefObject<ReaderWebViewHandle | null> = { current: null };
	let leave = noop;
	return {
		handle,
		/** Leaves the reader screen holding the page. */
		leave: (next?: Href) => leave(next),
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		get: () => state,
		/** Boots the page ahead of a likely read. */
		warmUp() {
			if (!state.warm) set({ warm: true });
		},
		/** Booted and not holding another book. */
		available: () => !!handle.current && !state.host,
		claim(host: string, leaveScreen: (next?: Href) => void) {
			if (!handle.current || state.host) return false;
			leave = leaveScreen;
			set({ host, visible: true });
			return true;
		},
		release(host: string) {
			if (state.host !== host) return;
			// A route removed without a Back (sign-out, a reset) still saves.
			if (handle.current?.isOpen()) void handle.current.close();
			leave = noop;
			set({ host: null, visible: false });
		},
		setVisible(host: string, visible: boolean) {
			if (state.host === host) set({ visible });
		},
	};
}
export type ReaderPoolValue = ReturnType<typeof createPool>;

const PoolContext = createContext<ReaderPoolValue | null>(null);

/**
 * A reader page booted ahead of time and kept loaded between books, so opening
 * one skips starting the WebView and its page. It waits in a hidden host and
 * is moved (not remounted) into the reader screen that claims it. It boots on
 * a sign of reading (a book's page, a closed reader), not at launch: a page
 * nobody opens is a renderer process held for the whole session.
 */
export function ReaderPool({
	userId,
	children,
}: {
	userId: string;
	children: ReactNode;
}) {
	const [pool] = useState(createPool);
	const state = useSyncExternalStore(pool.subscribe, pool.get);
	const page = useQuery({ ...readerPageQuery, enabled: state.warm });

	return (
		<PoolContext value={pool}>
			{children}
			{/* Laid out like a screen, so the page boots at its real size. */}
			<PortalHost name={STANDBY_HOST} style={styles.standby} />
			{state.warm && page.data ? (
				<Portal hostName={state.host ?? STANDBY_HOST} style={styles.fill}>
					<EmbedWebView
						userId={userId}
						page={page.data}
						fullScreen
						visible={state.visible}
						handleRef={pool.handle}
						onLeave={pool.leave}
					/>
				</Portal>
			) : null}
		</PoolContext>
	);
}

/** Boots the pooled page, so the next book opens without starting it. */
export function useWarmReader() {
	const pool = use(PoolContext);
	return () => pool?.warmUp();
}

/**
 * The pooled reader for one reader screen: claimed on mount, given back on
 * unmount. Null when it is busy or not booted yet; the screen then boots a
 * WebView of its own.
 */
export function usePooledReader(
	host: string,
	leaveScreen: (next?: Href) => void,
) {
	const pool = use(PoolContext);
	const navigation = useNavigation();
	const [pooled, setPooled] = useState(() => !!pool?.available());
	useMountEffect(() => {
		if (!pool) return;
		// This book booted a page of its own; the next one opens on the pool.
		if (!pooled) return () => pool.warmUp();
		if (!pool.claim(host, leaveScreen)) {
			setPooled(false);
			return () => pool.warmUp();
		}
		// Another screen stacked on the reader takes the system bars back.
		const focus = navigation.addListener("focus", () =>
			pool.setVisible(host, true),
		);
		const blur = navigation.addListener("blur", () =>
			pool.setVisible(host, false),
		);
		return () => {
			focus();
			blur();
			pool.release(host);
		};
	});
	return pooled ? pool : null;
}

/** Shows the screen on the pooled page once the screen's data is known. */
export function OpenPooled({
	pool,
	screen,
	serverId,
}: {
	pool: ReaderPoolValue;
	screen: ReaderBootScreen;
	serverId: string;
}) {
	const opened = useRef(false);
	useMountEffect(() => {
		if (opened.current) return;
		opened.current = true;
		pool.handle.current?.open(screen, serverId);
	});
	return null;
}

export function PooledReaderHost({ name }: { name: string }) {
	return <PortalHost name={name} style={styles.fill} />;
}

const styles = StyleSheet.create({
	fill: { flex: 1 },
	standby: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		opacity: 0,
		zIndex: -1,
		pointerEvents: "none",
	},
});
