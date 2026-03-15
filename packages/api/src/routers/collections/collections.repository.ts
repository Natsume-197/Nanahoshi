import { db } from "@nanahoshi-v2/db";
import {
	author,
	book,
	bookAuthor,
	bookMetadata,
	collection,
	collectionBook,
	library,
} from "@nanahoshi-v2/db/schema/general";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

type CreateCollectionRecordInput = {
	userId: string;
	organizationId: string;
	name: string;
	description: string | null;
	isPublic: boolean;
};

export class CollectionsRepository {
	async create(input: CreateCollectionRecordInput) {
		const [created] = await db.insert(collection).values(input).returning();
		return created;
	}

	async deleteByIdForUser(
		collectionId: string,
		userId: string,
		organizationId: string,
	) {
		await db
			.delete(collection)
			.where(
				and(
					eq(collection.id, collectionId),
					eq(collection.userId, userId),
					eq(collection.organizationId, organizationId),
				),
			);
	}

	async findByName(userId: string, organizationId: string, name: string) {
		const [row] = await db
			.select()
			.from(collection)
			.where(
				and(
					eq(collection.userId, userId),
					eq(collection.organizationId, organizationId),
					eq(collection.name, name),
				),
			)
			.limit(1);
		return row ?? null;
	}

	async getByIdForUser(
		collectionId: string,
		userId: string,
		organizationId: string,
	) {
		const [row] = await db
			.select()
			.from(collection)
			.where(
				and(
					eq(collection.id, collectionId),
					eq(collection.userId, userId),
					eq(collection.organizationId, organizationId),
				),
			)
			.limit(1);
		return row ?? null;
	}

	async getSummaryByIdForUser(
		collectionId: string,
		userId: string,
		organizationId: string,
	) {
		const [row] = await db
			.select({
				id: collection.id,
				name: collection.name,
				description: collection.description,
				isPublic: collection.isPublic,
				createdAt: collection.createdAt,
				updatedAt: collection.updatedAt,
				bookCount: sql<number>`CAST(COUNT(${collectionBook.bookId}) AS int)`,
			})
			.from(collection)
			.leftJoin(collectionBook, eq(collectionBook.collectionId, collection.id))
			.where(
				and(
					eq(collection.id, collectionId),
					eq(collection.userId, userId),
					eq(collection.organizationId, organizationId),
				),
			)
			.groupBy(collection.id)
			.limit(1);
		return row ?? null;
	}

	async listBookMembershipsByBookId(
		userId: string,
		organizationId: string,
		bookId: number,
	) {
		return db
			.select({
				id: collection.id,
				name: collection.name,
				description: collection.description,
				isPublic: collection.isPublic,
				inCollection: sql<boolean>`CASE WHEN ${collectionBook.bookId} IS NULL THEN false ELSE true END`,
				updatedAt: collection.updatedAt,
			})
			.from(collection)
			.leftJoin(
				collectionBook,
				and(
					eq(collectionBook.collectionId, collection.id),
					eq(collectionBook.bookId, bookId),
				),
			)
			.where(
				and(
					eq(collection.userId, userId),
					eq(collection.organizationId, organizationId),
				),
			)
			.orderBy(desc(collection.updatedAt), asc(collection.name));
	}

	async listBooksByCollectionForUser(
		collectionId: string,
		userId: string,
		organizationId: string,
	) {
		return db
			.select({
				id: book.id,
				uuid: book.uuid,
				filename: book.filename,
				title: bookMetadata.title,
				cover: bookMetadata.cover,
				addedAt: collectionBook.addedAt,
			})
			.from(collectionBook)
			.innerJoin(collection, eq(collection.id, collectionBook.collectionId))
			.innerJoin(book, eq(book.id, collectionBook.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.where(
				and(
					eq(collectionBook.collectionId, collectionId),
					eq(collection.userId, userId),
					eq(collection.organizationId, organizationId),
					eq(library.organizationId, organizationId),
				),
			)
			.orderBy(desc(collectionBook.addedAt), asc(book.filename));
	}

	async listAuthorsByBookIds(bookIds: number[]) {
		if (bookIds.length === 0) return [];
		return db
			.select({
				bookId: bookAuthor.bookId,
				authorId: author.id,
				name: author.name,
				role: bookAuthor.role,
			})
			.from(bookAuthor)
			.innerJoin(author, eq(author.id, bookAuthor.authorId))
			.where(inArray(bookAuthor.bookId, bookIds))
			.orderBy(asc(author.name));
	}

	async listByUser(userId: string, organizationId: string) {
		return db
			.select({
				id: collection.id,
				name: collection.name,
				description: collection.description,
				isPublic: collection.isPublic,
				createdAt: collection.createdAt,
				updatedAt: collection.updatedAt,
				bookCount: sql<number>`CAST(COUNT(${collectionBook.bookId}) AS int)`,
				previewCovers: sql<string[]>`COALESCE(
					(SELECT json_agg(sub.cover) FROM (
						SELECT bm.cover
						FROM collection_book cb
						JOIN book_metadata bm ON bm.book_id = cb.book_id
						WHERE cb.collection_id = ${collection.id} AND bm.cover IS NOT NULL
						ORDER BY cb.added_at DESC
						LIMIT 5
					) sub),
					'[]'::json
				)`,
			})
			.from(collection)
			.leftJoin(collectionBook, eq(collectionBook.collectionId, collection.id))
			.where(
				and(
					eq(collection.userId, userId),
					eq(collection.organizationId, organizationId),
				),
			)
			.groupBy(collection.id)
			.orderBy(desc(collection.updatedAt), asc(collection.name));
	}

	async setVisibility(collectionId: string, isPublic: boolean) {
		await db
			.update(collection)
			.set({
				isPublic,
				updatedAt: sql`NOW()`,
			})
			.where(eq(collection.id, collectionId));
	}

	async addBook(collectionId: string, bookId: number) {
		const result = await db
			.insert(collectionBook)
			.values({ collectionId, bookId })
			.onConflictDoNothing();
		return (result.rowCount ?? 0) > 0;
	}

	async removeBook(collectionId: string, bookId: number) {
		const result = await db
			.delete(collectionBook)
			.where(
				and(
					eq(collectionBook.collectionId, collectionId),
					eq(collectionBook.bookId, bookId),
				),
			);
		return (result.rowCount ?? 0) > 0;
	}

	async touch(collectionId: string) {
		await db
			.update(collection)
			.set({ updatedAt: sql`NOW()` })
			.where(eq(collection.id, collectionId));
	}
}

export const collectionsRepository = new CollectionsRepository();
