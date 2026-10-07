import type { AppRouter } from "@nanahoshi/api/routers/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import * as Network from "expo-network";

/** Ports a Nanahoshi server answers on: the Docker default and the dev API. */
const PORTS = [7331, 7333];
const PROBE_TIMEOUT_MS = 1200;
const CONCURRENCY = 48;

export type FoundServer = { url: string; host: string };

function withTimeout(ms: number, parent: AbortSignal) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ms);
	const onAbort = () => controller.abort();
	parent.addEventListener("abort", onAbort);
	return {
		signal: controller.signal,
		done: () => {
			clearTimeout(timer);
			parent.removeEventListener("abort", onAbort);
		},
	};
}

/**
 * Cheap first pass (better-auth's health route), then a Nanahoshi-only check:
 * `setup.ssoStatus` is public and its shape is ours, so another app on the
 * network that happens to run better-auth isn't offered as a library.
 */
export async function probeServer(
	url: string,
	parent: AbortSignal,
): Promise<boolean> {
	const probe = withTimeout(PROBE_TIMEOUT_MS, parent);
	try {
		const response = await fetch(`${url}/api/auth/ok`, {
			signal: probe.signal,
		});
		if (!response.ok) return false;
	} catch {
		return false;
	} finally {
		probe.done();
	}
	const confirm = withTimeout(PROBE_TIMEOUT_MS * 3, parent);
	try {
		const client: RouterClient<AppRouter> = createORPCClient(
			new RPCLink({
				url: `${url}/rpc`,
				fetch: (request, init) =>
					fetch(request, { ...init, signal: confirm.signal }),
			}),
		);
		const status = await client.setup.ssoStatus();
		return typeof status === "object" && status !== null && "signup" in status;
	} catch {
		return false;
	} finally {
		confirm.done();
	}
}

const PING_TIMEOUT_MS = 5000;

/** Whether the server answers at all; a slow remote server still counts. */
export async function pingServer(url: string): Promise<boolean> {
	const ping = withTimeout(PING_TIMEOUT_MS, new AbortController().signal);
	try {
		await fetch(`${url}/api/auth/ok`, { signal: ping.signal });
		return true;
	} catch {
		return false;
	} finally {
		ping.done();
	}
}

function privateSubnet(ip: string | null) {
	if (!ip) return null;
	const parts = ip.split(".").map(Number);
	if (
		parts.length !== 4 ||
		parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
	)
		return null;
	const [a, b] = parts;
	const isPrivate =
		a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
	return isPrivate ? parts.slice(0, 3).join(".") : null;
}

/**
 * Finds Nanahoshi servers on the phone's own /24: every host on the known
 * ports, a few dozen requests at a time. Each hit is reported as soon as it
 * is confirmed so the list fills while the scan continues.
 */
export async function discoverServers(
	signal: AbortSignal,
	onFound: (server: FoundServer) => void,
	onProgress: (done: number, total: number) => void,
): Promise<{ scanned: boolean }> {
	const ip = await Network.getIpAddressAsync().catch(() => null);
	const subnet = privateSubnet(ip);

	const candidates: string[] = [];
	// The Android emulator reaches its host machine through 10.0.2.2.
	for (const port of PORTS) candidates.push(`http://10.0.2.2:${port}`);
	if (subnet) {
		for (let host = 1; host <= 254; host++) {
			const address = `${subnet}.${host}`;
			if (address === ip) continue;
			for (const port of PORTS) candidates.push(`http://${address}:${port}`);
		}
	}

	let next = 0;
	let done = 0;
	const worker = async () => {
		while (!signal.aborted && next < candidates.length) {
			const url = candidates[next++];
			if (await probeServer(url, signal)) {
				onFound({ url, host: url.replace(/^https?:\/\//, "") });
			}
			done++;
			onProgress(done, candidates.length);
		}
	};
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));
	return { scanned: subnet !== null };
}
