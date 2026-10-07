/** While the server isn't answering, how often it is asked again, so the app
 * comes back on its own once the server (or its address) is back. */
export const RECHECK_MS = 10_000;

export type Reachability = "unknown" | "reachable" | "unreachable";

type Cancel = () => void;

export type ReachabilityDeps = {
	/** Whether the server answered at all (any HTTP status counts). */
	probe: () => Promise<boolean>;
	/** Runs when the server answers again after not answering. */
	onRecovered?: () => void;
	after?: (ms: number, run: () => void) => Cancel;
};

const defaultAfter = (ms: number, run: () => void): Cancel => {
	const timer = setTimeout(run, ms);
	return () => clearTimeout(timer);
};

/**
 * Whether the server itself answers, apart from whether the phone has a
 * network: with Wi-Fi up, a server that is off or moved to another address
 * must not read as "you're offline".
 */
export function createServerReachability({
	probe,
	onRecovered,
	after = defaultAfter,
}: ReachabilityDeps) {
	let status: Reachability = "unknown";
	let checking: Promise<boolean> | null = null;
	let recheck: Cancel | null = null;
	let stopped = false;
	const listeners = new Set<() => void>();

	const set = (next: Reachability) => {
		if (next === status) return;
		const recovered = status === "unreachable" && next === "reachable";
		status = next;
		for (const listener of listeners) listener();
		if (recovered) onRecovered?.();
	};
	const cancelRecheck = () => {
		recheck?.();
		recheck = null;
	};

	const check = (): Promise<boolean> => {
		stopped = false;
		if (checking) return checking;
		cancelRecheck();
		checking = probe()
			.catch(() => false)
			.then((up) => {
				checking = null;
				set(up ? "reachable" : "unreachable");
				if (!up && !stopped) recheck = after(RECHECK_MS, () => void check());
				return up;
			});
		return checking;
	};

	return {
		status: () => status,
		check,
		/** A request got an answer: no need to ask. */
		answered() {
			if (status === "reachable") return;
			cancelRecheck();
			set("reachable");
		},
		/** A request never got an answer: find out whether the server is gone
		 * (already known gone, the recheck timer is on it). */
		failed() {
			if (status !== "unreachable") void check();
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		/** Stops asking again on a timer; the next check resumes it. */
		stop() {
			stopped = true;
			cancelRecheck();
		},
	};
}

export type ServerReachability = ReturnType<typeof createServerReachability>;

/** A failure with no HTTP status never reached the server (oRPC errors carry
 * the status the server answered with). */
export function isUnanswered(error: unknown): boolean {
	const status = (error as { status?: unknown } | null)?.status;
	return typeof status !== "number" || status === 0;
}

/** Host and port, the way people recognise their server's address. */
export function serverHost(serverUrl: string): string {
	return serverUrl.replace(/^https?:\/\//i, "");
}
