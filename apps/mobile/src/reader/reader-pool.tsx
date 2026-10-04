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
// Booting the page competes with the app's own first screens; wait for them.
const WARM_UP_DELAY_MS = 1500;

type PoolState = { host: string | null; visible: boolean };
const noop = (_next?: Href) => {};

function createPool() {
	let state: PoolState = { host: null, visible: false };
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
 * is moved (not remounted) into the reader screen that claims it.
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
	const page = useQuery(readerPageQuery);
	const [warm, setWarm] = useState(false);
	useMountEffect(() => {
		const timer = setTimeout(() => setWarm(true), WARM_UP_DELAY_MS);
		return () => clearTimeout(timer);
	});

	return (
		<PoolContext value={pool}>
			{children}
			{/* Laid out like a screen, so the page boots at its real size. */}
			<PortalHost name={STANDBY_HOST} style={styles.standby} />
			{warm && page.data ? (
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
		if (!pool || !pooled) return;
		if (!pool.claim(host, leaveScreen)) {
			setPooled(false);
			return;
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
