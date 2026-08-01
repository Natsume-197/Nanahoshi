import { db } from "@nanahoshi-v2/db";
import { scannedDirectory } from "@nanahoshi-v2/db/schema/general";
import { and, eq, ne, or, sql } from "drizzle-orm";

export type KnownScannedDirectory = {
	path: string;
	mtimeMs: number;
	completedScanRunId?: string | null;
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
				completedScanRunId: scannedDirectory.completedScanRunId,
			})
			.from(scannedDirectory)
			.where(eq(scannedDirectory.libraryPathId, libraryPathId));
	}

	async upsertBatch(
		libraryPathId: number,
		rows: KnownScannedDirectory[],
		completedScanRunId?: string,
	): Promise<void> {
		if (rows.length === 0) return;
		await db.execute(sql`
			insert into scanned_directory (path, library_path_id, mtime_ms, completed_scan_run_id)
			select * from unnest(
				${sql.param(rows.map((row) => row.path))}::text[],
				${sql.param(rows.map(() => libraryPathId))}::bigint[],
				${sql.param(rows.map((row) => row.mtimeMs))}::bigint[],
				${sql.param(rows.map(() => completedScanRunId ?? null))}::uuid[]
			)
			on conflict (path, library_path_id) do update set
				mtime_ms = excluded.mtime_ms,
				completed_scan_run_id = excluded.completed_scan_run_id,
				updated_at = now()
		`);
	}

	/** Removes directory rows not completed by a successful full traversal. */
	async pruneNotCompleted(
		libraryPathId: number,
		completedScanRunId: string,
	): Promise<void> {
		await db
			.delete(scannedDirectory)
			.where(
				and(
					eq(scannedDirectory.libraryPathId, libraryPathId),
					or(
						ne(scannedDirectory.completedScanRunId, completedScanRunId),
						sql`${scannedDirectory.completedScanRunId} is null`,
					),
				),
			);
	}
}

export const scannedDirectoryRepository = new ScannedDirectoryRepository();
