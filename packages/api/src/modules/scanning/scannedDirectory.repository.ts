import { db } from "@nanahoshi-v2/db";
import { scannedDirectory } from "@nanahoshi-v2/db/schema/general";
import { and, eq, notInArray, sql } from "drizzle-orm";

export type KnownScannedDirectory = {
	path: string;
	mtimeMs: number;
};

/**
 * Hides the advisory directory-mtime index behind a small interface. Callers
 * only learn "load" and "replace these observations"; batching and conflict
 * handling remain local here.
 */
export class ScannedDirectoryRepository {
	async loadByLibraryPath(
		libraryPathId: number,
	): Promise<KnownScannedDirectory[]> {
		return await db
			.select({
				path: scannedDirectory.path,
				mtimeMs: scannedDirectory.mtimeMs,
			})
			.from(scannedDirectory)
			.where(eq(scannedDirectory.libraryPathId, libraryPathId));
	}

	async upsertBatch(
		libraryPathId: number,
		rows: KnownScannedDirectory[],
	): Promise<void> {
		if (rows.length === 0) return;
		await db.execute(sql`
			insert into scanned_directory (path, library_path_id, mtime_ms)
			select * from unnest(
				${sql.param(rows.map((row) => row.path))}::text[],
				${sql.param(rows.map(() => libraryPathId))}::bigint[],
				${sql.param(rows.map((row) => row.mtimeMs))}::bigint[]
			)
			on conflict (path, library_path_id) do update set
				mtime_ms = excluded.mtime_ms,
				updated_at = now()
		`);
	}

	/** Removes index rows for directories a full reconciliation did not see. */
	async pruneMissing(
		libraryPathId: number,
		observedPaths: string[],
	): Promise<void> {
		// A full walk always observes its root. Keeping the guard makes this
		// method safe if a future caller has no observations after an I/O error.
		if (observedPaths.length === 0) return;
		await db
			.delete(scannedDirectory)
			.where(
				and(
					eq(scannedDirectory.libraryPathId, libraryPathId),
					notInArray(scannedDirectory.path, observedPaths),
				),
			);
	}
}

export const scannedDirectoryRepository = new ScannedDirectoryRepository();
