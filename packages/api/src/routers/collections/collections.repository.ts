import { db } from "@nanahoshi-v2/db";
import {
	author,
	book,
	bookAuthor,
	bookMetadata,
	collection,
	collectionBook,
} from "@nanahoshi-v2/db/schema/general";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

type CreateCollectionRecordInput = {
	userId: string;
	name: string;
	description: string | null;
	isPublic: boolean;
};

export class CollectionsRepository {
	async create(input: CreateCollectionRecordInput) {
		const [created] = await db.insert(collection).values(input).returning();
		return created;
	}

	async deleteByIdForUser(collectionId: string, userId: string) {
		await db
			.delete(collection)
			.where(
				and(eq(collection.id, collectionId), eq(collection.userId, userId)),
			);
	}

	async findByName(userId: string, name: string) {
		const [row] = await db
			.select()
			.from(collection)
			.where(and(eq(collection.userId, userId), eq(collection.name, name)))
			.limit(1);
		return row ?? null;
	}

	async getByIdForUser(collectionId: string, userId: string) {
		const [row] = await db
			.select()
			.from(collection)
			.where(
				and(eq(collection.id, collectionId), eq(collection.userId, userId)),
			)
			.limit(1);
		return row ?? null;
	}

	async getSummaryByIdForUser(collectionId: string, userId: string) {
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
				and(eq(collection.id, collectionId), eq(collection.userId, userId)),
			)
			.groupBy(collection.id)
			.limit(1);
		return row ?? null;
	}

	async listBookMembershipsByBookId(userId: string, bookId: number) {
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
			.where(eq(collection.userId, userId))
			.orderBy(desc(collection.updatedAt), asc(collection.name));
	}

	async listBooksByCollectionForUser(collectionId: string, userId: string) {
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
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.where(
				and(
					eq(collectionBook.collectionId, collectionId),
					eq(collection.userId, userId),
				),
			)
			.orderBy(desc(collectionBook.addedAt), asc(book.filename));
	}

	async listAuthorsByBookIds(bookIds: number[]) {
		if (bookIds.length === 0) return [];
		return db
			.select({
				bookId: bookAuthor.bookId,
				name: author.name,
				role: bookAuthor.role,
			})
			.from(bookAuthor)
			.innerJoin(author, eq(author.id, bookAuthor.authorId))
			.where(inArray(bookAuthor.bookId, bookIds))
			.orderBy(asc(author.name));
	}

	async listByUser(userId: string) {
		return db
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
			.where(eq(collection.userId, userId))
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
