// Namespace import on purpose: test files stub node:fs/promises process-wide
// and a partial stub of `default` would leave this module without an fs.
import * as fs from "node:fs/promises";
import path from "node:path";
import { BadRequestError } from "../../errors";

/** Reachability verdict for one library folder, as shown in the library UI. */
export type PathProbe =
	| { state: "ok" }
	| {
			state: "missing" | "not_a_directory" | "unreadable" | "timeout";
			reason: string;
	  };

// A hung network mount can make fs calls block for minutes. The probe runs on
// request, so it always answers — a stuck mount reports "timeout" instead of
// holding the API handler open.
const PROBE_TIMEOUT_MS = 3000;

function withTimeout<T>(work: Promise<T>, onTimeout: () => T): Promise<T> {
	return new Promise<T>((resolve) => {
		const timer = setTimeout(() => resolve(onTimeout()), PROBE_TIMEOUT_MS);
		work
			.then((value) => resolve(value))
			.catch(() => resolve(onTimeout()))
			.finally(() => clearTimeout(timer));
	});
}

/**
 * Guards library folder input: a typo'd or unmounted path would otherwise be
 * accepted silently — the scan aborts server-side and the user only sees an
 * empty library. Singleton object so tests can spy without mock.module.
 */
export const pathAccess = {
	async assertAccessible(paths: string[]) {
		for (const p of paths) {
			try {
				await fs.access(path.normalize(p));
			} catch {
				throw new BadRequestError(
					`Folder is not accessible on the server: ${p} — check the path (and, on Docker, that it is mounted into the container).`,
				);
			}
		}
	},

	/**
	 * Non-throwing reachability check for an existing folder. Distinguishes gone
	 * from unreadable from stuck, because the fix differs (re-mount vs chmod vs
	 * check the NAS) and the UI names it.
	 */
	probe(folder: string): Promise<PathProbe> {
		const target = path.normalize(folder);
		return withTimeout<PathProbe>(
			(async (): Promise<PathProbe> => {
				let stat: Awaited<ReturnType<typeof fs.stat>>;
				try {
					stat = await fs.stat(target);
				} catch (error) {
					const code = (error as NodeJS.ErrnoException).code;
					if (code === "EACCES" || code === "EPERM") {
						return {
							state: "unreadable",
							reason: `Permission denied (${code})`,
						};
					}
					return { state: "missing", reason: code ?? "Folder not found" };
				}
				if (!stat.isDirectory()) {
					return { state: "not_a_directory", reason: "Not a folder" };
				}
				try {
					await fs.access(target, fs.constants.R_OK);
				} catch (error) {
					const code = (error as NodeJS.ErrnoException).code;
					return { state: "unreadable", reason: `Not readable (${code})` };
				}
				return { state: "ok" };
			})(),
			() => ({
				state: "timeout",
				reason: `No response after ${PROBE_TIMEOUT_MS}ms — the mount may be offline`,
			}),
		);
	},
};
