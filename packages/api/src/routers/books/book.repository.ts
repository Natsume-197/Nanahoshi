import { eq, and, sql } from "drizzle-orm";
import { db } from "@nanahoshi-v2/db";
import { book } from "@nanahoshi-v2/db/schema/general";
import type { Book, CreateBookInput } from "./book.model";
import { bookMetadataRepository } from "./metadata/metadata.repository";

export class BookRepository {
	async create(input: CreateBookInput): Promise<Book> {
		const [inserted] = await db
			.insert(book)
			.values(input)
			.onConflictDoNothing({ target: book.filehash })
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

    async getByRelativePath(relativePath: string, libraryPathId: number): Promise<Book | null> {
        // Normalize path separators (convert backslashes to forward slashes)
        const normalizedPath = relativePath.replace(/\\/g, '/');
        
        // Use SQL to normalize paths in the database for comparison
        const [result] = await db
            .select()
            .from(book)
            .where(
                and(
                    eq(book.libraryPathId, libraryPathId),
                    sql`REPLACE(${book.relativePath}, '\\', '/') = ${normalizedPath}`
                )
            );
        
        return result ?? null;
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
	
    async removeBookByRelativePath(relativePath: string, libraryPathId: number): Promise<boolean> {
        try {
			console.log(relativePath, libraryPathId)
            const bookRecord = await this.getByRelativePath(relativePath, libraryPathId);
            
            if (!bookRecord) {
                console.log(`Book not found for relative path: ${relativePath}`);
                return false;
            }

            return await this.removeBook(Number(bookRecord.id));
        } catch (error) {
            console.error(`Error removing book by relative path ${relativePath}:`, error);
            return false;
        }
    }

}
export const bookRepository = new BookRepository();
