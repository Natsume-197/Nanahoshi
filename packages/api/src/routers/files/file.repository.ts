import { db } from "@nanahoshi-v2/db";
import { book, libraryPath } from "@nanahoshi-v2/db/schema/general";
import { eq } from "drizzle-orm";

export const findBookByUuid = async (uuid: string) => {
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
};
