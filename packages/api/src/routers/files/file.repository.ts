import { db } from "@nanahoshi-v2/db";
import { book, library, libraryPath } from "@nanahoshi-v2/db/schema/general";
import { and, eq } from "drizzle-orm";

export class FileRepository {
	async findBookByUuid(uuid: string, serverId?: string) {
		if (serverId) {
			const [b] = await db
				.select({
					id: book.id,
					uuid: book.uuid,
					filename: book.filename,
					mediaType: book.mediaType,
					relativePath: book.relativePath,
					libraryPath: libraryPath.path,
					filesizeKb: book.filesizeKb,
				})
				.from(book)
				.innerJoin(library, eq(library.id, book.libraryId))
				.leftJoin(libraryPath, eq(book.libraryPathId, libraryPath.id))
				.where(and(eq(book.uuid, uuid), eq(library.serverId, serverId)))
				.limit(1);

			return b || null;
		}

		const [b] = await db
			.select({
				id: book.id,
				uuid: book.uuid,
				filename: book.filename,
				mediaType: book.mediaType,
				relativePath: book.relativePath,
				libraryPath: libraryPath.path,
				filesizeKb: book.filesizeKb,
			})
			.from(book)
			.leftJoin(libraryPath, eq(book.libraryPathId, libraryPath.id))
			.where(eq(book.uuid, uuid))
			.limit(1);

		return b || null;
	}
}

export const fileRepository = new FileRepository();
