import { db } from "@nanahoshi-v2/db";
import { book, library, libraryPath } from "@nanahoshi-v2/db/schema/general";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import type {
	CreateLibraryInput,
	CreateLibraryPathInput,
	LibraryComplete,
	LibraryPath,
	MetadataConfig,
	MetadataProvidersConfig,
} from "./library.model";

export class LibraryRepository {
	async create(
		input: Omit<CreateLibraryInput, "serverId" | "id" | "createdAt"> & {
			paths?: string[];
		},
		serverId: string,
	): Promise<LibraryComplete> {
		return db.transaction(async (tx) => {
			const { paths, ...libraryInput } = input;
			const [created] = await tx
				.insert(library)
				.values({
					...libraryInput,
					serverId,
				} as typeof library.$inferInsert)
				.returning();

			if (!created) {
				throw new Error("Failed to create library");
			}

			if (paths?.length) {
				await tx.insert(libraryPath).values(
					paths.map((path) => ({
						libraryId: created.id,
						path,
						isEnabled: true,
					})),
				);
			}

			const createdPaths = paths
				? await tx
						.select()
						.from(libraryPath)
						.where(eq(libraryPath.libraryId, created.id))
				: [];

			return {
				...created,
				paths: createdPaths,
			};
		});
	}

	/** Libraries that opted into scheduled scanning (used to seed the scheduler). */
	async findSchedulable(): Promise<
		Array<{ id: number; serverId: string; scanIntervalMinutes: number | null }>
	> {
		return db
			.select({
				id: library.id,
				serverId: library.serverId,
				scanIntervalMinutes: library.scanIntervalMinutes,
			})
			.from(library)
			.where(
				and(
					eq(library.isCronWatch, true),
					isNotNull(library.scanIntervalMinutes),
				),
			);
	}

	async getServerIdByLibraryId(libraryId: number): Promise<string | null> {
		const [row] = await db
			.select({ serverId: library.serverId })
			.from(library)
			.where(eq(library.id, libraryId))
			.limit(1);
		return row?.serverId ?? null;
	}

	async getAutoEnrichPausedAt(libraryId: number): Promise<string | null> {
		const [row] = await db
			.select({ pausedAt: library.autoEnrichPausedAt })
			.from(library)
			.where(eq(library.id, libraryId))
			.limit(1);
		return row?.pausedAt ?? null;
	}

	async getIdByUuid(uuid: string, serverId: string): Promise<number | null> {
		const [row] = await db
			.select({ id: library.id })
			.from(library)
			.where(and(eq(library.uuid, uuid), eq(library.serverId, serverId)))
			.limit(1);
		return row?.id ?? null;
	}

	async getIdAndMediaTypeByUuid(
		uuid: string,
		serverId: string,
	): Promise<{ id: number; mediaType: "ebook" | "audiobook" } | null> {
		const [row] = await db
			.select({ id: library.id, mediaType: library.mediaType })
			.from(library)
			.where(and(eq(library.uuid, uuid), eq(library.serverId, serverId)))
			.limit(1);
		if (!row) return null;
		return {
			id: row.id,
			mediaType: row.mediaType === "audiobook" ? "audiobook" : "ebook",
		};
	}

	async findAll(): Promise<LibraryComplete[]> {
		const libs = await db.select().from(library);

		const result: LibraryComplete[] = [];
		for (const lib of libs) {
			const paths = await db
				.select()
				.from(libraryPath)
				.where(eq(libraryPath.libraryId, lib.id));
			result.push({ ...lib, paths });
		}
		return result;
	}

	/** Per-library card data for the explore page: visible book count plus a
	 * few recent covers (canonical books only — duplicates are hidden). */
	async findOverviewByOrganization(serverId: string): Promise<
		Array<{
			id: number;
			uuid: string;
			name: string | null;
			mediaType: "ebook" | "audiobook";
			autoEnrichPausedAt: string | null;
			lastScannedAt: string | null;
			bookCount: number;
			pathCount: number;
			enabledPathCount: number;
			unreachablePathCount: number;
			previewCovers: string[];
		}>
	> {
		return db
			.select({
				id: library.id,
				uuid: library.uuid,
				name: library.name,
				mediaType: library.mediaType,
				autoEnrichPausedAt: library.autoEnrichPausedAt,
				lastScannedAt: library.lastScannedAt,
				bookCount: sql<number>`CAST(COUNT(${book.id}) AS int)`,
				// Folder rollups as scalar subqueries: joining library_path here
				// would multiply the book rows and inflate bookCount.
				pathCount: sql<number>`CAST((
					SELECT COUNT(*) FROM library_path lp
					WHERE lp.library_id = ${library.id}
				) AS int)`,
				enabledPathCount: sql<number>`CAST((
					SELECT COUNT(*) FROM library_path lp
					WHERE lp.library_id = ${library.id} AND lp.is_enabled IS NOT FALSE
				) AS int)`,
				unreachablePathCount: sql<number>`CAST((
					SELECT COUNT(*) FROM library_path lp
					WHERE lp.library_id = ${library.id}
						AND lp.is_enabled IS NOT FALSE
						AND lp.last_error IS NOT NULL
				) AS int)`,
				previewCovers: sql<string[]>`COALESCE(
					(SELECT json_agg(sub.cover) FROM (
						SELECT COALESCE(bm.cover, am.cover) AS cover
						FROM book b2
						LEFT JOIN book_metadata bm ON bm.book_id = b2.id
						LEFT JOIN audiobook_metadata am ON am.book_id = b2.id
						WHERE b2.library_id = ${library.id}
							AND b2.duplicate_of_book_id IS NULL
							AND COALESCE(bm.cover, am.cover) IS NOT NULL
						ORDER BY b2.created_at DESC
						LIMIT 3
					) sub),
					'[]'::json
				)`,
			})
			.from(library)
			.leftJoin(
				book,
				and(eq(book.libraryId, library.id), isNull(book.duplicateOfBookId)),
			)
			.where(eq(library.serverId, serverId))
			.groupBy(library.id)
			.orderBy(asc(library.createdAt), asc(library.id));
	}

	async findByOrganization(serverId: string): Promise<LibraryComplete[]> {
		const libs = await db
			.select()
			.from(library)
			.where(eq(library.serverId, serverId));

		const result: LibraryComplete[] = [];
		for (const lib of libs) {
			const paths = await db
				.select()
				.from(libraryPath)
				.where(eq(libraryPath.libraryId, lib.id));
			result.push({ ...lib, paths });
		}
		return result;
	}

	async getUuidById(id: number): Promise<string | null> {
		const [row] = await db
			.select({ uuid: library.uuid })
			.from(library)
			.where(eq(library.id, id))
			.limit(1);
		return row?.uuid ?? null;
	}

	async findById(
		id: number,
		serverId: string,
	): Promise<LibraryComplete | null> {
		const [lib] = await db
			.select()
			.from(library)
			.where(and(eq(library.id, id), eq(library.serverId, serverId)));
		if (!lib) return null;

		const paths = await db
			.select()
			.from(libraryPath)
			.where(eq(libraryPath.libraryId, lib.id));

		return { ...lib, paths };
	}

	async findByUuid(
		uuid: string,
		serverId: string,
	): Promise<LibraryComplete | null> {
		const [lib] = await db
			.select()
			.from(library)
			.where(and(eq(library.uuid, uuid), eq(library.serverId, serverId)));
		if (!lib) return null;

		const paths = await db
			.select()
			.from(libraryPath)
			.where(eq(libraryPath.libraryId, lib.id));

		return { ...lib, paths };
	}

	async addPath(input: CreateLibraryPathInput): Promise<LibraryPath | null> {
		const [inserted] = await db
			.insert(libraryPath)
			.values(input)
			.onConflictDoNothing({
				target: [libraryPath.libraryId, libraryPath.path],
			})
			.returning();

		if (!inserted) {
			throw new Error("Path already exists in this library");
		}

		return inserted;
	}

	async removePath(id: number): Promise<boolean> {
		const deleted = await db.delete(libraryPath).where(eq(libraryPath.id, id));
		return (deleted.rowCount ?? 0) > 0;
	}

	async findPathsByLibraryId(libraryId: number) {
		return await db
			.select()
			.from(libraryPath)
			.where(eq(libraryPath.libraryId, libraryId));
	}

	/** Returns the id + path of every root in a library (used by dedupe). */
	async listPathsByLibrary(
		libraryId: number,
	): Promise<Array<{ id: number; path: string }>> {
		return db
			.select({ id: libraryPath.id, path: libraryPath.path })
			.from(libraryPath)
			.where(eq(libraryPath.libraryId, libraryId));
	}

	async setPathEnabled(
		pathId: number,
		enabled: boolean,
	): Promise<LibraryPath | null> {
		const [updated] = await db
			.update(libraryPath)
			.set({ isEnabled: enabled })
			.where(eq(libraryPath.id, pathId))
			.returning();
		return updated ?? null;
	}

	async update(
		id: number,
		data: {
			name?: string;
			isCronWatch?: boolean;
			scanIntervalMinutes?: number | null;
			realtimeWatchEnabled?: boolean;
			automaticGroupingEnabled?: boolean;
			metadataProviders?: MetadataProvidersConfig;
			metadataConfig?: MetadataConfig;
		},
		serverId: string,
	): Promise<LibraryComplete | null> {
		const [updated] = await db
			.update(library)
			.set(data)
			.where(and(eq(library.id, id), eq(library.serverId, serverId)))
			.returning();
		if (!updated) return null;

		const paths = await db
			.select()
			.from(libraryPath)
			.where(eq(libraryPath.libraryId, updated.id));

		return { ...updated, paths };
	}

	// Pause/resume automatic enrichment for a library. Scheduled retries and
	// event-driven admission consult this flag; explicit user actions ignore it.
	async setAutoEnrichPaused(
		uuid: string,
		paused: boolean,
		serverId: string,
	): Promise<boolean> {
		const [updated] = await db
			.update(library)
			.set({ autoEnrichPausedAt: paused ? sql`now()` : null })
			.where(and(eq(library.uuid, uuid), eq(library.serverId, serverId)))
			.returning({ id: library.id });
		return updated != null;
	}

	// Pause/resume every library in the server at once (tray-wide toggle).
	async setAllAutoEnrichPaused(
		serverId: string,
		paused: boolean,
	): Promise<number> {
		const updated = await db
			.update(library)
			.set({ autoEnrichPausedAt: paused ? sql`now()` : null })
			.where(eq(library.serverId, serverId))
			.returning({ id: library.id });
		return updated.length;
	}

	/** Stamped when a scan run ends, so "last scanned" outlives the Redis task. */
	async setLastScannedAt(libraryId: number): Promise<void> {
		await db
			.update(library)
			.set({ lastScannedAt: sql`now()` })
			.where(eq(library.id, libraryId));
	}

	/**
	 * Records this folder's reachability verdict. `error: null` marks it healthy;
	 * a message marks it unreachable so the UI can explain why the catalog stopped
	 * growing instead of leaving the failure in the logs.
	 */
	async setPathHealth(pathId: number, error: string | null): Promise<void> {
		await db
			.update(libraryPath)
			.set({ lastError: error, lastCheckedAt: sql`now()` })
			.where(eq(libraryPath.id, pathId));
	}

	/** Books currently attributed to each folder of a library. */
	async countBooksByPath(
		libraryId: number,
	): Promise<Array<{ pathId: number | null; bookCount: number }>> {
		return db
			.select({
				pathId: book.libraryPathId,
				bookCount: sql<number>`CAST(COUNT(${book.id}) AS int)`,
			})
			.from(book)
			.where(
				and(
					eq(book.libraryId, libraryId),
					isNotNull(book.libraryPathId),
					isNull(book.duplicateOfBookId),
				),
			)
			.groupBy(book.libraryPathId);
	}

	async delete(id: number, serverId: string): Promise<boolean> {
		const deleted = await db
			.delete(library)
			.where(and(eq(library.id, id), eq(library.serverId, serverId)));
		return (deleted.rowCount ?? 0) > 0;
	}

	async findLibraryIdForPath(
		pathId: number,
		serverId: string,
	): Promise<number | null> {
		const [row] = await db
			.select({ libraryId: libraryPath.libraryId })
			.from(libraryPath)
			.innerJoin(library, eq(library.id, libraryPath.libraryId))
			.where(and(eq(libraryPath.id, pathId), eq(library.serverId, serverId)));
		return row?.libraryId ?? null;
	}
}

export const libraryRepository = new LibraryRepository();
