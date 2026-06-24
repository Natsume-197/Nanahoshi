import { db } from "@nanahoshi-v2/db";
import { library, libraryPath } from "@nanahoshi-v2/db/schema/general";
import { and, eq } from "drizzle-orm";

import type {
	CreateLibraryInput,
	CreateLibraryPathInput,
	LibraryComplete,
	LibraryPath,
} from "./library.model";

export class LibraryRepository {
	async create(
		input: Omit<CreateLibraryInput, "organizationId" | "id" | "createdAt"> & {
			paths?: string[];
		},
		organizationId: string,
	): Promise<LibraryComplete> {
		return db.transaction(async (tx) => {
			const { paths, ...libraryInput } = input;
			const [created] = await tx
				.insert(library)
				.values({
					...libraryInput,
					organizationId,
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

	async findByOrganization(organizationId: string): Promise<LibraryComplete[]> {
		const libs = await db
			.select()
			.from(library)
			.where(eq(library.organizationId, organizationId));

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
		organizationId: string,
	): Promise<LibraryComplete | null> {
		const [lib] = await db
			.select()
			.from(library)
			.where(
				and(eq(library.id, id), eq(library.organizationId, organizationId)),
			);
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

	async update(
		id: number,
		data: {
			name?: string;
			isCronWatch?: boolean;
			isPublic?: boolean;
			metadataProviders?: string[];
		},
		organizationId: string,
	): Promise<LibraryComplete | null> {
		const [updated] = await db
			.update(library)
			.set(data)
			.where(
				and(eq(library.id, id), eq(library.organizationId, organizationId)),
			)
			.returning();
		if (!updated) return null;

		const paths = await db
			.select()
			.from(libraryPath)
			.where(eq(libraryPath.libraryId, updated.id));

		return { ...updated, paths };
	}

	async delete(id: number, organizationId: string): Promise<boolean> {
		const deleted = await db
			.delete(library)
			.where(
				and(eq(library.id, id), eq(library.organizationId, organizationId)),
			);
		return (deleted.rowCount ?? 0) > 0;
	}

	async findLibraryIdForPath(
		pathId: number,
		organizationId: string,
	): Promise<number | null> {
		const [row] = await db
			.select({ libraryId: libraryPath.libraryId })
			.from(libraryPath)
			.innerJoin(library, eq(library.id, libraryPath.libraryId))
			.where(
				and(
					eq(libraryPath.id, pathId),
					eq(library.organizationId, organizationId),
				),
			);
		return row?.libraryId ?? null;
	}
}

export const libraryRepository = new LibraryRepository();
