import fs from "node:fs/promises";
import path from "node:path";
import { BadRequestError } from "../../errors";

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
};
