import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	UPDATER_PROTOCOL,
	UPDATER_REQUESTS_DIR,
	UPDATER_STALE_MS,
	UPDATER_STATUS_FILE,
	type UpdaterRequest,
	type UpdaterStatus,
	UpdaterStatusSchema,
} from "./protocol";

export type UpdaterConnection =
	| { state: "absent" }
	| { state: "stale"; status: UpdaterStatus }
	| { state: "incompatible"; status: UpdaterStatus }
	| { state: "connected"; status: UpdaterStatus };

/** What the updater last said, and whether it is still answering. */
export async function readUpdaterConnection(
	directory: string,
	now = Date.now(),
): Promise<UpdaterConnection> {
	let raw: string;
	try {
		raw = await readFile(join(directory, UPDATER_STATUS_FILE), "utf8");
	} catch {
		return { state: "absent" };
	}
	let parsed: ReturnType<typeof UpdaterStatusSchema.safeParse>;
	try {
		parsed = UpdaterStatusSchema.safeParse(JSON.parse(raw));
	} catch {
		return { state: "absent" };
	}
	if (!parsed.success) return { state: "absent" };
	const status = parsed.data;
	if (status.protocol !== UPDATER_PROTOCOL) {
		return { state: "incompatible", status };
	}
	const heartbeat = Date.parse(status.heartbeatAt);
	if (!Number.isFinite(heartbeat) || now - heartbeat > UPDATER_STALE_MS) {
		return { state: "stale", status };
	}
	return { state: "connected", status };
}

/**
 * Ask the updater for `request`. The file is empty and appears atomically, so
 * the updater never sees half a request.
 */
export async function writeUpdaterRequest(
	directory: string,
	request: UpdaterRequest,
) {
	const requests = join(directory, UPDATER_REQUESTS_DIR);
	await mkdir(requests, { recursive: true });
	const temporary = join(requests, `.${request}.${crypto.randomUUID()}`);
	await writeFile(temporary, "");
	try {
		await rename(temporary, join(requests, request));
	} catch (error) {
		await rm(temporary, { force: true });
		throw error;
	}
}
