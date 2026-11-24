import { access } from "node:fs/promises";
import { hostname } from "node:os";
import { logger } from "@nanahoshi/api/lib/logger";
import {
	DEFAULT_UPDATER_DIR,
	UPDATER_HEARTBEAT_MS,
} from "@nanahoshi/api/modules/updates/protocol";
import { createSocketDockerClient } from "./docker-client";
import { type HealthAnswer, Updater } from "./updater";

// Nanahoshi's updater sidecar. It holds the Docker socket so the server never
// does, and acts only on the empty request files the server leaves in the
// shared folder (see packages/api/src/modules/updates/protocol.ts).

const SOCKET = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";
const REQUEST_POLL_MS = 2_000;
const TARGET_REFRESH_MS = 5 * 60_000;

const updaterLogger = logger.child({ component: "updater" });

function log(message: string, extra: Record<string, unknown> = {}) {
	updaterLogger.info(extra, message);
}

function positiveInt(value: string | undefined, fallback: number) {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function checkHealth(address: string): Promise<HealthAnswer> {
	const host = address.includes(":") ? `[${address}]` : address;
	try {
		const response = await fetch(`http://${host}:3000/health`, {
			signal: AbortSignal.timeout(4_000),
		});
		if (response.ok) return { kind: "ok" };
		if (response.status === 503) {
			const body = (await response.json().catch(() => null)) as {
				safeMode?: boolean;
				code?: string;
			} | null;
			if (body?.safeMode) return { kind: "safe-mode", code: body.code ?? null };
		}
	} catch {}
	return { kind: "unreachable" };
}

const updater = new Updater({
	docker: createSocketDockerClient(SOCKET),
	directory: process.env.NANAHOSHI_UPDATER_DIR ?? DEFAULT_UPDATER_DIR,
	target: process.env.NANAHOSHI_UPDATER_TARGET || undefined,
	service: process.env.NANAHOSHI_UPDATER_SERVICE || "server",
	selfId: hostname(),
	version: process.env.NANAHOSHI_RELEASE ?? "development",
	owner: {
		uid: positiveInt(process.env.PUID, 1000),
		gid: positiveInt(process.env.PGID, 1000),
	},
	checkHealth,
	verifyTimeoutMs:
		positiveInt(process.env.NANAHOSHI_UPDATER_VERIFY_MINUTES, 20) * 60_000,
	verifyIntervalMs: 3_000,
	stopTimeoutSeconds: positiveInt(
		process.env.NANAHOSHI_UPDATER_STOP_SECONDS,
		40,
	),
	log,
});

try {
	await access(SOCKET);
} catch {
	log(`The Docker socket isn't mounted at ${SOCKET}; in-app updates are off.`);
}

await updater.start();
log("Updater ready", {
	target: updater.current.target,
	problem: updater.current.problem,
});

let busy = false;
let lastRefresh = Date.now();

// The heartbeat runs during an install too: the server that comes back up
// must find a fresh answer, or it would think the updater is gone.
setInterval(() => {
	void updater
		.heartbeat()
		.catch((err) => log("Heartbeat failed", { error: String(err) }));
}, UPDATER_HEARTBEAT_MS);

setInterval(async () => {
	if (busy) return;
	busy = true;
	try {
		const request = await updater.takeRequest();
		if (request === "install") await updater.install();
		else if (request === "stage") await updater.stage();
		else if (Date.now() - lastRefresh > TARGET_REFRESH_MS) {
			lastRefresh = Date.now();
			await updater.refreshTarget();
			await updater.heartbeat();
		}
	} catch (error) {
		log("Request failed", {
			error: error instanceof Error ? error.message : String(error),
		});
	} finally {
		busy = false;
	}
}, REQUEST_POLL_MS);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
	process.on(signal, () => process.exit(0));
}
