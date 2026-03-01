import { db } from "@nanahoshi-v2/db";
import {
	author,
	book,
	bookAuthor,
	bookMetadata,
	library,
	publisher,
} from "@nanahoshi-v2/db/schema/general";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Book, CreateBookInput } from "./book.model";
import { bookMetadataRepository } from "./metadata/metadata.repository";

export class BookRepository {
	async create(input: CreateBookInput): Promise<Book> {
		const [inserted] = await db
			.insert(book)
			.values(input)
			.onConflictDoNothing({ target: [book.libraryId, book.filehash] })
			.returning();
		return inserted;
	}

	async getById(id: bigint): Promise<Book | null> {
		const [result] = await db.select().from(book).where(eq(book.id, id));
		return result ?? null;
	}

	async getByUuid(uuid: string): Promise<Book | null> {
		const [result] = await db.select().from(book).where(eq(book.uuid, uuid));
		return result ?? null;
	}

	async getWithMetadata(uuid: string) {
		const bookRow = await this.getByUuid(uuid);
		if (!bookRow) return null;

		const metadata = await bookMetadataRepository.findByBookId(
			Number(bookRow.id),
		);
		return { ...bookRow, ...metadata };
	}

	async getByRelativePath(
		relativePath: string,
		libraryPathId: number,
	): Promise<Book | null> {
		// Normalize path separators (convert backslashes to forward slashes)
		const normalizedPath = relativePath.replace(/\\/g, "/");

		// Use SQL to normalize paths in the database for comparison
		const [result] = await db
			.select()
			.from(book)
			.where(
				and(
					eq(book.libraryPathId, libraryPathId),
					sql`REPLACE(${book.relativePath}, '\\', '/') = ${normalizedPath}`,
				),
			);

		return result ?? null;
	}

	async listRecent(limit = 20, organizationId?: string) {
		let query = db
			.select({
				id: book.id,
				uuid: book.uuid,
				filename: book.filename,
				filesizeKb: book.filesizeKb,
				createdAt: book.createdAt,
				lastModified: book.lastModified,
				title: bookMetadata.title,
				subtitle: bookMetadata.subtitle,
				description: bookMetadata.description,
				cover: bookMetadata.cover,
				mainColor: bookMetadata.mainColor,
				languageCode: bookMetadata.languageCode,
				pageCount: bookMetadata.pageCount,
				publisherName: publisher.name,
			})
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.leftJoin(publisher, eq(publisher.id, bookMetadata.publisherId))
			.orderBy(desc(book.createdAt))
			.limit(limit);

		if (organizationId) {
			query = query.where(
				eq(library.organizationId, organizationId),
			) as typeof query;
		}

		const rows = await query;

		// Fetch authors for each book
		const bookIds = rows.map((r) => r.id);
		const authorsMap = new Map<number, { name: string; role: string }[]>();

		if (bookIds.length > 0) {
			const authorRows = await db
				.select({
					bookId: bookAuthor.bookId,
					name: author.name,
					role: bookAuthor.role,
				})
				.from(bookAuthor)
				.innerJoin(author, eq(author.id, bookAuthor.authorId))
				.where(
					sql`${bookAuthor.bookId} = ANY(${sql.raw(`ARRAY[${bookIds.join(",")}]`)})`,
				);

			for (const row of authorRows) {
				const list = authorsMap.get(Number(row.bookId)) ?? [];
				list.push({ name: row.name, role: row.role ?? "Author" });
				authorsMap.set(Number(row.bookId), list);
			}
		}

		return rows.map((row) => ({
			...row,
			authors: authorsMap.get(Number(row.id)) ?? [],
		}));
	}

	async removeBook(id: number): Promise<boolean> {
		try {
			// THIS REMOVES ALSO
			// - bookMetadata (cascade)
			// - bookAuthor (cascade)
			// - likedBook (cascade)
			// - collectionBook (cascade)

			const deleted = await db.delete(book).where(eq(book.id, id));

			return (deleted.rowCount ?? 0) > 0;
		} catch (error) {
			console.error(`Error removing book with id ${id}:`, error);
			return false;
		}
	}

	async removeBookByRelativePath(
		relativePath: string,
		libraryPathId: number,
	): Promise<boolean> {
		try {
			console.log(relativePath, libraryPathId);
			const bookRecord = await this.getByRelativePath(
				relativePath,
				libraryPathId,
			);

			if (!bookRecord) {
				console.log(`Book not found for relative path: ${relativePath}`);
				return false;
			}

			return await this.removeBook(Number(bookRecord.id));
		} catch (error) {
			console.error(
				`Error removing book by relative path ${relativePath}:`,
				error,
			);
			return false;
		}
	}
}
export const bookRepository = new BookRepository();
