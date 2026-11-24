import { z } from "zod";

// The contract between the Nanahoshi server and its updater sidecar.
//
// They share one small volume and nothing else: the server never gets the
// Docker socket, and the updater never gets database or Redis credentials.
//
// - The server asks by creating an empty file in `requests/`. The file name is
//   the whole request; the updater never reads a request's contents, so a
//   compromised server can only ask for the two things below, and only for the
//   image reference the container already runs.
//   - `stage`: pull the newest image for the current reference.
//   - `install`: pull if needed, then recreate the server container from it,
//     keeping its volumes, networks and settings.
// - The updater answers in `status.json` and rewrites it at least every
//   `UPDATER_HEARTBEAT_MS`, so a stale file means the updater is gone.

export const UPDATER_PROTOCOL = 1;
export const UPDATER_HEARTBEAT_MS = 30_000;
/** Status older than this means the updater stopped answering. */
export const UPDATER_STALE_MS = 3 * UPDATER_HEARTBEAT_MS;
export const UPDATER_REQUESTS_DIR = "requests";
export const UPDATER_STATUS_FILE = "status.json";
export const UPDATER_REQUESTS = ["stage", "install"] as const;
export type UpdaterRequest = (typeof UPDATER_REQUESTS)[number];

export const DEFAULT_UPDATER_DIR = "/var/lib/nanahoshi-updater";

export const UpdaterPhaseSchema = z.enum([
	"idle",
	"pulling",
	"stopping",
	"recreating",
	"verifying",
]);
export type UpdaterPhase = z.infer<typeof UpdaterPhaseSchema>;

export const UpdaterOperationSchema = z.object({
	action: z.enum(["stage", "install"]),
	startedAt: z.string(),
	finishedAt: z.string().nullable(),
	result: z.enum(["running", "ok", "failed", "up-to-date"]),
	/** One sentence, safe to show an admin. */
	message: z.string().nullable(),
	fromVersion: z.string().nullable(),
	toVersion: z.string().nullable(),
});
export type UpdaterOperation = z.infer<typeof UpdaterOperationSchema>;

export const UpdaterStatusSchema = z.object({
	protocol: z.number().int(),
	updaterVersion: z.string(),
	heartbeatAt: z.string(),
	/** Why the updater cannot act, when it cannot (no socket, no target...). */
	problem: z.string().nullable(),
	target: z
		.object({
			container: z.string(),
			image: z.string(),
			/** The reference names an exact version, so pulling it never moves. */
			pinned: z.boolean(),
			runningVersion: z.string().nullable(),
		})
		.nullable(),
	staged: z
		.object({
			version: z.string().nullable(),
			pulledAt: z.string(),
		})
		.nullable(),
	phase: UpdaterPhaseSchema,
	progress: z
		.object({
			completedBytes: z.number(),
			totalBytes: z.number(),
		})
		.nullable(),
	lastOperation: UpdaterOperationSchema.nullable(),
});
export type UpdaterStatus = z.infer<typeof UpdaterStatusSchema>;

/**
 * Whether an image reference follows new releases. Only a reference without a
 * tag, or with `latest`, moves when it is pulled again; anything else (an
 * exact `v1.4.0`, a digest) is the operator's choice to stay put.
 */
export function isFloatingReference(reference: string) {
	if (reference.includes("@")) return false;
	const lastSlash = reference.lastIndexOf("/");
	const colon = reference.indexOf(":", lastSlash + 1);
	if (colon === -1) return true;
	return reference.slice(colon + 1) === "latest";
}
