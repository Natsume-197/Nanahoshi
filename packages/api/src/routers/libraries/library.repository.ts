import { db } from "@nanahoshi-v2/db";
import { library, libraryPath } from "@nanahoshi-v2/db/schema/general";
import { eq } from "drizzle-orm";

import type {
	CreateLibraryInput,
	CreateLibraryPathInput,
	LibraryComplete,
	LibraryPath,
} from "./library.model";

export class LibraryRepository {
	async create(
		input: CreateLibraryInput & { paths?: string[] },
		organizationId: string,
	): Promise<LibraryComplete> {
		return db.transaction(async (tx) => {
			const { paths, ...libraryInput } = input;
			const [created] = await tx.insert(library).values({
				...libraryInput,
				organizationId,
			} as typeof library.$inferInsert).returning();

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

	async findById(id: number): Promise<LibraryComplete | null> {
		const [lib] = await db.select().from(library).where(eq(library.id, id));
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
}
