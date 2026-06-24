import { db } from "@nanahoshi-v2/db";
import { scannedFile } from "@nanahoshi-v2/db/schema/general";
import { and, eq, gt, inArray, or, sql } from "drizzle-orm";

type ScannedFileRow = typeof scannedFile.$inferSelect;

export type KnownScannedFile = Pick<
	ScannedFileRow,
	"id" | "path" | "size" | "mtime" | "status" | "hash"
>;

export type UpsertScannedFileRow = {
	path: string;
	libraryPathId: number;
	size: number;
	mtime: Date;
	status: string;
	hash: string;
};

export class ScannedFileRepository {
	/** Loads the fields used to detect changes for one library path. */
	async loadByLibraryPath(libraryPathId: number): Promise<KnownScannedFile[]> {
		return db
			.select({
				id: scannedFile.id,
				path: scannedFile.path,
				size: scannedFile.size,
				mtime: scannedFile.mtime,
				status: scannedFile.status,
				hash: scannedFile.hash,
			})
			.from(scannedFile)
			.where(eq(scannedFile.libraryPathId, libraryPathId));
	}

	/** Upserts a batch of discovered files, refreshing the row on path conflict. */
	async upsertBatch(rows: UpsertScannedFileRow[]): Promise<void> {
		if (rows.length === 0) return;
		await db
			.insert(scannedFile)
			.values(rows)
			.onConflictDoUpdate({
				target: [scannedFile.path, scannedFile.libraryPathId],
				set: {
					status: sql`excluded.status`,
					hash: sql`excluded.hash`,
					size: sql`excluded.size`,
					mtime: sql`excluded.mtime`,
					updatedAt: sql`now()`,
				},
			});
	}

	/** Re-hashes a single row in place (legacy size-only hashes), keeping status. */
	async rehash(
		path: string,
		libraryPathId: number,
		hash: string,
	): Promise<void> {
		await db
			.update(scannedFile)
			.set({ hash, updatedAt: new Date() })
			.where(
				and(
					eq(scannedFile.path, path),
					eq(scannedFile.libraryPathId, libraryPathId),
				),
			);
	}

	/** Promotes surviving "pending" rows to "verified" (phase 4). */
	async promotePending(libraryPathId: number): Promise<void> {
		await db
			.update(scannedFile)
			.set({ status: "verified", updatedAt: new Date() })
			.where(
				and(
					eq(scannedFile.status, "pending"),
					eq(scannedFile.libraryPathId, libraryPathId),
				),
			);
	}

	/** Counts rows by status for one library path. */
	async statusCounts(
		libraryPathId: number,
	): Promise<Array<{ status: string; count: number }>> {
		return db
			.select({
				status: scannedFile.status,
				count: sql<number>`count(*)::int`,
			})
			.from(scannedFile)
			.where(eq(scannedFile.libraryPathId, libraryPathId))
			.groupBy(scannedFile.status);
	}

	/** Deletes a batch of rows by absolute path (caller slices to batch size). */
	async deleteByPaths(paths: string[], libraryPathId: number): Promise<void> {
		if (paths.length === 0) return;
		await db
			.delete(scannedFile)
			.where(
				and(
					inArray(scannedFile.path, paths),
					eq(scannedFile.libraryPathId, libraryPathId),
				),
			);
	}

	/** Hashes appearing more than once anywhere across the given library paths. */
	async duplicateHashes(pathIds: number[]): Promise<string[]> {
		const groups = await db
			.select({ hash: scannedFile.hash })
			.from(scannedFile)
			.where(inArray(scannedFile.libraryPathId, pathIds))
			.groupBy(scannedFile.hash)
			.having(sql`count(*) > 1`);
		return groups.map((g) => g.hash);
	}

	/**
	 * Every member of a duplicate group, plus rows previously marked "duplicate"
	 * (their canonical may be gone by now). Ordered by id for stable grouping.
	 */
	async rowsInDuplicateGroups(
		pathIds: number[],
		hashes: string[],
	): Promise<ScannedFileRow[]> {
		return db
			.select()
			.from(scannedFile)
			.where(
				and(
					inArray(scannedFile.libraryPathId, pathIds),
					or(
						hashes.length > 0 ? inArray(scannedFile.hash, hashes) : sql`false`,
						eq(scannedFile.status, "duplicate"),
					),
				),
			)
			.orderBy(scannedFile.id);
	}

	/** Marks a batch of rows as "duplicate" (caller slices to batch size). */
	async markDuplicate(ids: number[]): Promise<void> {
		if (ids.length === 0) return;
		await db
			.update(scannedFile)
			.set({ status: "duplicate", updatedAt: new Date() })
			.where(inArray(scannedFile.id, ids));
	}

	/** Resets a batch of recovered rows to "pending" (caller slices to batch size). */
	async markPending(ids: number[]): Promise<void> {
		if (ids.length === 0) return;
		await db
			.update(scannedFile)
			.set({ status: "pending", updatedAt: new Date() })
			.where(inArray(scannedFile.id, ids));
	}

	/** Paginated page of "verified" rows for one library path, ordered by id. */
	async listVerifiedAfter(
		libraryPathId: number,
		lastId: number,
		limit: number,
	): Promise<ScannedFileRow[]> {
		return db
			.select()
			.from(scannedFile)
			.where(
				and(
					eq(scannedFile.status, "verified"),
					eq(scannedFile.libraryPathId, libraryPathId),
					gt(scannedFile.id, lastId),
				),
			)
			.orderBy(scannedFile.id)
			.limit(limit);
	}

	/** Marks the row at a path as "done" once the worker processed it. */
	async markDone(path: string, libraryPathId: number): Promise<void> {
		await db
			.update(scannedFile)
			.set({ status: "done", updatedAt: sql`now()` })
			.where(
				and(
					eq(scannedFile.path, path),
					eq(scannedFile.libraryPathId, libraryPathId),
				),
			);
	}
}

export const scannedFileRepository = new ScannedFileRepository();
