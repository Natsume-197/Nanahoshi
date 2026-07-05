import { db } from "@nanahoshi-v2/db";
import { library, libraryPath } from "@nanahoshi-v2/db/schema/general";
import { and, eq, isNotNull } from "drizzle-orm";

import type {
	CreateLibraryInput,
	CreateLibraryPathInput,
	LibraryComplete,
	LibraryPath,
	MetadataConfig,
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
			isPublic?: boolean;
			metadataProviders?: string[];
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
