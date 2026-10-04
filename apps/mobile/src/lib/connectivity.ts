/** How long a "disconnected" must hold before the app believes it: Wi-Fi
 * roaming and network handoffs report a loss followed by a new network. */
export const CONFIRM_MS = 2000;
/** While offline, how often the network is asked again: Android sends no event
 * when it lifts the background network block, so waiting for one can strand
 * the app offline. */
export const RECHECK_MS = 3000;

type Cancel = () => void;

export type ConnectivityDeps = {
	/** Whether the device has a network right now. */
	read: () => Promise<boolean>;
	setOnline: (online: boolean) => void;
	/** Whether the app is in the foreground. */
	isActive: () => boolean;
	after?: (ms: number, run: () => void) => Cancel;
};

const defaultAfter = (ms: number, run: () => void): Cancel => {
	const timer = setTimeout(run, ms);
	return () => clearTimeout(timer);
};

/**
 * Turns the device's network events into the app's online state. Android 15+
 * blocks a backgrounded app's network, and while blocked expo-network reports
 * it as disconnected; nothing is reported when the block lifts. So a loss only
 * counts once confirmed in the foreground, and offline is rechecked until the
 * network is back.
 */
export function createConnectivity({
	read,
	setOnline,
	isActive,
	after = defaultAfter,
}: ConnectivityDeps) {
	let online = true;
	let pending: Cancel | null = null;
	// Bumped on every input, so a slow read can't overwrite a newer answer.
	let version = 0;

	const set = (next: boolean) => {
		if (next === online) return;
		online = next;
		setOnline(next);
	};
	const cancel = () => {
		pending?.();
		pending = null;
	};
	const schedule = (ms: number) => {
		cancel();
		pending = after(ms, () => {
			pending = null;
			void check();
		});
	};
	const check = async () => {
		const asked = ++version;
		const connected = await read().catch(() => true);
		if (asked !== version) return;
		if (connected) return set(true);
		if (!isActive()) return;
		set(false);
		schedule(RECHECK_MS);
	};

	return {
		networkChanged(connected: boolean) {
			version++;
			if (connected) {
				cancel();
				set(true);
			} else if (isActive()) {
				schedule(CONFIRM_MS);
			}
		},
		async foreground() {
			const asked = ++version;
			const connected = await read().catch(() => true);
			if (asked !== version) return;
			if (connected) {
				cancel();
				set(true);
			} else {
				schedule(CONFIRM_MS);
			}
		},
		background() {
			version++;
			cancel();
		},
		dispose() {
			version++;
			cancel();
		},
	};
}
