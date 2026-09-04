import { db } from "@nanahoshi-v2/db";
import { user } from "@nanahoshi-v2/db/schema/auth";
import {
	audiobookAuthor,
	audiobookMetadata,
	author,
	book,
	bookAuthor,
	bookMetadata,
	collection,
	collectionBook,
	library,
	likedBook,
	listeningProgress,
	readingProgress,
	userAudiobookShelf,
	userBookShelf,
} from "@nanahoshi-v2/db/schema/general";
import {
	and,
	asc,
	desc,
	eq,
	ilike,
	inArray,
	isNull,
	or,
	sql,
} from "drizzle-orm";
import type { DynamicCollectionDefinitionV1 } from "./collection-rules";
import { compileDynamicCollectionQuery } from "./collection-rules.compiler";

type CreateCollectionRecordInput = {
	userId: string;
	serverId: string;
	name: string;
	description: string | null;
	isPublic: boolean;
	kind: "manual" | "dynamic";
	dynamicDefinition: unknown | null;
};

export class CollectionsRepository {
	async listRuleOptions(
		field:
			| "author"
			| "narrator"
			| "publisher"
			| "series"
			| "genre"
			| "tag"
			| "library"
			| "manualCollection",
		query: string,
		limit: number,
		userId: string,
		serverId: string,
		accessibleLibraryIds: number[] | "ALL",
	): Promise<Array<{ id: string; label: string }>> {
		if (field === "library") {
			const scope =
				accessibleLibraryIds === "ALL"
					? undefined
					: accessibleLibraryIds.length === 0
						? sql`false`
						: inArray(library.id, accessibleLibraryIds);
			return db
				.select({
					id: library.uuid,
					label: sql<string>`COALESCE(${library.name}, 'Library')`,
				})
				.from(library)
				.where(
					and(
						eq(library.serverId, serverId),
						scope,
						query ? ilike(library.name, `%${query}%`) : undefined,
					),
				)
				.orderBy(asc(library.name))
				.limit(limit);
		}
		if (field === "manualCollection") {
			return db
				.select({ id: collection.id, label: collection.name })
				.from(collection)
				.where(
					and(
						eq(collection.serverId, serverId),
						eq(collection.kind, "manual"),
						or(eq(collection.userId, userId), eq(collection.isPublic, true)),
						query ? ilike(collection.name, `%${query}%`) : undefined,
					),
				)
				.orderBy(asc(collection.name))
				.limit(limit);
		}

		const sources = {
			author: {
				table: "author",
				relation:
					"SELECT book_id, author_id AS entity_id FROM book_author UNION ALL SELECT book_id, author_id AS entity_id FROM audiobook_author",
			},
			narrator: {
				table: "narrator",
				relation: "SELECT book_id, narrator_id AS entity_id FROM book_narrator",
			},
			publisher: {
				table: "publisher",
				relation:
					"SELECT book_id, publisher_id AS entity_id FROM book_metadata WHERE publisher_id IS NOT NULL UNION ALL SELECT book_id, publisher_id AS entity_id FROM audiobook_metadata WHERE publisher_id IS NOT NULL",
			},
			series: {
				table: "series",
				relation:
					"SELECT book_id, series_id AS entity_id FROM book_series UNION ALL SELECT book_id, series_id AS entity_id FROM audiobook_series",
			},
			genre: {
				table: "genre",
				relation:
					"SELECT book_id, genre_id AS entity_id FROM book_genre UNION ALL SELECT book_id, genre_id AS entity_id FROM audiobook_genre",
			},
			tag: {
				table: "tag",
				relation:
					"SELECT book_id, tag_id AS entity_id FROM book_tag UNION ALL SELECT book_id, tag_id AS entity_id FROM audiobook_tag",
			},
		} as const;
		const source = sources[field];
		const scope =
			accessibleLibraryIds === "ALL"
				? sql`true`
				: accessibleLibraryIds.length === 0
					? sql`false`
					: sql`b.library_id IN (${sql.join(
							accessibleLibraryIds.map((id) => sql`${id}`),
							sql`, `,
						)})`;
		const result = await db.execute(sql`
			SELECT e.uuid::text AS id, e.name AS label
			FROM ${sql.raw(source.table)} e
			WHERE e.server_id = ${serverId}
				AND (${query} = '' OR e.name ILIKE ${`%${query}%`})
				AND EXISTS (
					SELECT 1 FROM (${sql.raw(source.relation)}) rel
					INNER JOIN book b ON b.id = rel.book_id
					INNER JOIN library l ON l.id = b.library_id
					WHERE rel.entity_id = e.id AND l.server_id = ${serverId}
						AND b.duplicate_of_book_id IS NULL AND ${scope}
				)
			ORDER BY e.name ASC
			LIMIT ${limit}
		`);
		return result.rows as Array<{ id: string; label: string }>;
	}

	async listManualReferences(ids: string[], serverId: string) {
		if (ids.length === 0) return [];
		return db
			.select({
				id: collection.id,
				userId: collection.userId,
				isPublic: collection.isPublic,
			})
			.from(collection)
			.where(
				and(
					eq(collection.serverId, serverId),
					eq(collection.kind, "manual"),
					inArray(collection.id, ids),
				),
			);
	}

	async listVisibleDynamic(userId: string, serverId: string) {
		return db
			.select({ id: collection.id, name: collection.name })
			.from(collection)
			.where(
				and(
					eq(collection.serverId, serverId),
					eq(collection.kind, "dynamic"),
					or(eq(collection.userId, userId), eq(collection.isPublic, true)),
				),
			)
			.orderBy(asc(collection.name));
	}

	async create(input: CreateCollectionRecordInput) {
		const [created] = await db.insert(collection).values(input).returning();
		return created;
	}

	async deleteByIdForUser(
		collectionId: string,
		userId: string,
		serverId: string,
	) {
		await db
			.delete(collection)
			.where(
				and(
					eq(collection.id, collectionId),
					eq(collection.userId, userId),
					eq(collection.serverId, serverId),
				),
			);
	}

	async findByName(userId: string, serverId: string, name: string) {
		const [row] = await db
			.select()
			.from(collection)
			.where(
				and(
					eq(collection.userId, userId),
					eq(collection.serverId, serverId),
					eq(collection.name, name),
				),
			)
			.limit(1);
		return row ?? null;
	}

	async getByIdForUser(collectionId: string, userId: string, serverId: string) {
		const [row] = await db
			.select()
			.from(collection)
			.where(
				and(
					eq(collection.id, collectionId),
					eq(collection.userId, userId),
					eq(collection.serverId, serverId),
				),
			)
			.limit(1);
		return row ?? null;
	}

	async listBookMembershipsByBookId(
		userId: string,
		serverId: string,
		bookId: number,
	) {
		return db
			.select({
				id: collection.id,
				name: collection.name,
				description: collection.description,
				isPublic: collection.isPublic,
				kind: collection.kind,
				inCollection: sql<boolean>`CASE WHEN ${collectionBook.bookId} IS NULL THEN false ELSE true END`,
				bookCount: sql<number>`(SELECT COUNT(*)::int FROM collection_book cb WHERE cb.collection_id = ${collection.id})`,
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
					eq(collection.serverId, serverId),
					eq(collection.kind, "manual"),
				),
			)
			.orderBy(desc(collection.updatedAt), asc(collection.name));
	}

	async listAuthorsByBookIds(bookIds: number[]) {
		if (bookIds.length === 0) return [];
		const ebookAuthors = db
			.select({
				bookId: bookAuthor.bookId,
				authorId: author.id,
				name: author.name,
			})
			.from(bookAuthor)
			.innerJoin(author, eq(author.id, bookAuthor.authorId))
			.where(inArray(bookAuthor.bookId, bookIds));
		const audioAuthors = db
			.select({
				bookId: audiobookAuthor.bookId,
				authorId: author.id,
				name: author.name,
			})
			.from(audiobookAuthor)
			.innerJoin(author, eq(author.id, audiobookAuthor.authorId))
			.where(inArray(audiobookAuthor.bookId, bookIds));
		const [ebookRows, audioRows] = await Promise.all([
			ebookAuthors,
			audioAuthors,
		]);
		return [...ebookRows, ...audioRows];
	}

	async listByUser(userId: string, serverId: string) {
		return db
			.select({
				id: collection.id,
				name: collection.name,
				description: collection.description,
				isPublic: collection.isPublic,
				kind: collection.kind,
				dynamicDefinition: collection.dynamicDefinition,
				createdAt: collection.createdAt,
				updatedAt: collection.updatedAt,
				bookCount: sql<
					number | null
				>`CASE WHEN ${collection.kind} = 'dynamic' THEN NULL ELSE CAST(COUNT(${collectionBook.bookId}) AS int) END`,
				ebookCount: sql<
					number | null
				>`CASE WHEN ${collection.kind} = 'dynamic' THEN NULL ELSE CAST(COUNT(${collectionBook.bookId}) FILTER (WHERE ${library.mediaType} = 'ebook') AS int) END`,
				audiobookCount: sql<
					number | null
				>`CASE WHEN ${collection.kind} = 'dynamic' THEN NULL ELSE CAST(COUNT(${collectionBook.bookId}) FILTER (WHERE ${library.mediaType} = 'audiobook') AS int) END`,
				previewCovers: sql<string[]>`COALESCE(
					(SELECT json_agg(sub.cover) FROM (
						SELECT COALESCE(bm.cover, am.cover) AS cover
						FROM collection_book cb
						JOIN book b2 ON b2.id = cb.book_id
						LEFT JOIN book_metadata bm ON bm.book_id = cb.book_id
						LEFT JOIN audiobook_metadata am ON am.book_id = cb.book_id
						WHERE cb.collection_id = ${collection.id} AND COALESCE(bm.cover, am.cover) IS NOT NULL
						ORDER BY cb.added_at DESC
						LIMIT 5
					) sub),
					'[]'::json
				)`,
				ebookPreviewCovers: sql<string[]>`COALESCE(
					(SELECT json_agg(sub.cover) FROM (
						SELECT bm.cover
						FROM collection_book cb
						JOIN book b2 ON b2.id = cb.book_id
						JOIN library l2 ON l2.id = b2.library_id
						JOIN book_metadata bm ON bm.book_id = cb.book_id
						WHERE cb.collection_id = ${collection.id} AND l2.media_type = 'ebook' AND bm.cover IS NOT NULL
						ORDER BY cb.added_at DESC
						LIMIT 5
					) sub),
					'[]'::json
				)`,
				audiobookPreviewCovers: sql<string[]>`COALESCE(
					(SELECT json_agg(sub.cover) FROM (
						SELECT am.cover
						FROM collection_book cb
						JOIN book b2 ON b2.id = cb.book_id
						JOIN library l2 ON l2.id = b2.library_id
						JOIN audiobook_metadata am ON am.book_id = cb.book_id
						WHERE cb.collection_id = ${collection.id} AND l2.media_type = 'audiobook' AND am.cover IS NOT NULL
						ORDER BY cb.added_at DESC
						LIMIT 5
					) sub),
					'[]'::json
				)`,
			})
			.from(collection)
			.leftJoin(collectionBook, eq(collectionBook.collectionId, collection.id))
			.leftJoin(book, eq(book.id, collectionBook.bookId))
			.leftJoin(library, eq(library.id, book.libraryId))
			.where(
				and(eq(collection.userId, userId), eq(collection.serverId, serverId)),
			)
			.groupBy(collection.id)
			.orderBy(desc(collection.updatedAt), asc(collection.name));
	}

	async listPublicByUsername(username: string, serverId: string, limit = 4) {
		return db
			.select({
				id: collection.id,
				name: collection.name,
				description: collection.description,
				isPublic: collection.isPublic,
				kind: collection.kind,
				dynamicDefinition: collection.dynamicDefinition,
				createdAt: collection.createdAt,
				updatedAt: collection.updatedAt,
				bookCount: sql<
					number | null
				>`CASE WHEN ${collection.kind} = 'dynamic' THEN NULL ELSE CAST(COUNT(${collectionBook.bookId}) AS int) END`,
				previewCovers: sql<string[]>`COALESCE(
					(SELECT json_agg(sub.cover) FROM (
						SELECT COALESCE(bm.cover, am.cover) AS cover
						FROM collection_book cb
						JOIN book b2 ON b2.id = cb.book_id
						LEFT JOIN book_metadata bm ON bm.book_id = cb.book_id
						LEFT JOIN audiobook_metadata am ON am.book_id = cb.book_id
						WHERE cb.collection_id = ${collection.id} AND COALESCE(bm.cover, am.cover) IS NOT NULL
						ORDER BY cb.added_at DESC
						LIMIT 5
					) sub),
					'[]'::json
				)`,
			})
			.from(collection)
			.innerJoin(user, eq(user.id, collection.userId))
			.leftJoin(collectionBook, eq(collectionBook.collectionId, collection.id))
			.where(
				and(
					eq(collection.serverId, serverId),
					eq(collection.isPublic, true),
					eq(user.username, username.toLowerCase()),
				),
			)
			.groupBy(collection.id)
			.orderBy(desc(collection.updatedAt), asc(collection.name))
			.limit(limit);
	}

	/**
	 * Public collections in the server (any owner) plus the viewer's own private
	 * ones, matching `query` by name. Mirrors the shape of {@link listByUser} but
	 * joins the owner for display/linking.
	 */
	async search(query: string, serverId: string, viewerId: string, limit = 10) {
		const pattern = `%${query}%`;
		return db
			.select({
				id: collection.id,
				name: collection.name,
				description: collection.description,
				isPublic: collection.isPublic,
				kind: collection.kind,
				dynamicDefinition: collection.dynamicDefinition,
				updatedAt: collection.updatedAt,
				isOwner: sql<boolean>`(${collection.userId} = ${viewerId})`,
				ownerUsername: user.username,
				ownerName: user.name,
				bookCount: sql<
					number | null
				>`CASE WHEN ${collection.kind} = 'dynamic' THEN NULL ELSE CAST(COUNT(${collectionBook.bookId}) AS int) END`,
				previewCovers: sql<string[]>`COALESCE(
					(SELECT json_agg(sub.cover) FROM (
						SELECT COALESCE(bm.cover, am.cover) AS cover
						FROM collection_book cb
						JOIN book b2 ON b2.id = cb.book_id
						LEFT JOIN book_metadata bm ON bm.book_id = cb.book_id
						LEFT JOIN audiobook_metadata am ON am.book_id = cb.book_id
						WHERE cb.collection_id = ${collection.id} AND COALESCE(bm.cover, am.cover) IS NOT NULL
						ORDER BY cb.added_at DESC
						LIMIT 5
					) sub),
					'[]'::json
				)`,
			})
			.from(collection)
			.innerJoin(user, eq(user.id, collection.userId))
			.leftJoin(collectionBook, eq(collectionBook.collectionId, collection.id))
			.where(
				and(
					eq(collection.serverId, serverId),
					ilike(collection.name, pattern),
					or(eq(collection.isPublic, true), eq(collection.userId, viewerId)),
				),
			)
			.groupBy(collection.id, user.id)
			.orderBy(desc(collection.updatedAt), asc(collection.name))
			.limit(limit);
	}

	/**
	 * Summary for viewing a collection that is either public or owned by the
	 * viewer. Returns `isOwner` so the UI can gate mutation controls.
	 */
	async getPublicSummaryById(
		collectionId: string,
		serverId: string,
		viewerId: string,
	) {
		const [row] = await db
			.select({
				id: collection.id,
				name: collection.name,
				description: collection.description,
				isPublic: collection.isPublic,
				kind: collection.kind,
				dynamicDefinition: collection.dynamicDefinition,
				createdAt: collection.createdAt,
				updatedAt: collection.updatedAt,
				isOwner: sql<boolean>`(${collection.userId} = ${viewerId})`,
				ownerUsername: user.username,
				ownerName: user.name,
				ownerImage: user.image,
				bookCount: sql<
					number | null
				>`CASE WHEN ${collection.kind} = 'dynamic' THEN NULL ELSE CAST(COUNT(${collectionBook.bookId}) AS int) END`,
			})
			.from(collection)
			.innerJoin(user, eq(user.id, collection.userId))
			.leftJoin(collectionBook, eq(collectionBook.collectionId, collection.id))
			.where(
				and(
					eq(collection.id, collectionId),
					eq(collection.serverId, serverId),
					or(eq(collection.isPublic, true), eq(collection.userId, viewerId)),
				),
			)
			.groupBy(collection.id, user.id)
			.limit(1);
		return row ?? null;
	}

	async listVisibleSummariesByIds(
		collectionIds: string[],
		serverId: string,
		viewerId: string,
	) {
		if (collectionIds.length === 0) return [];
		return db
			.select({
				id: collection.id,
				kind: collection.kind,
				dynamicDefinition: collection.dynamicDefinition,
			})
			.from(collection)
			.where(
				and(
					eq(collection.serverId, serverId),
					inArray(collection.id, collectionIds),
					or(eq(collection.isPublic, true), eq(collection.userId, viewerId)),
				),
			);
	}

	async listDynamicItems(
		definition: DynamicCollectionDefinitionV1,
		context: {
			viewerId: string;
			serverId: string;
			accessibleLibraryIds: number[] | "ALL";
			timeZone: string;
			query?: string;
			randomSeed?: string;
		},
		options: { limit: number; offset: number },
	) {
		const compiled = compileDynamicCollectionQuery(definition, context);
		const query = db
			.select({
				id: book.id,
				uuid: book.uuid,
				filename: book.filename,
				title: sql<
					string | null
				>`CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.title} ELSE ${bookMetadata.title} END`,
				cover: sql<
					string | null
				>`CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.cover} ELSE ${bookMetadata.cover} END`,
				mainColor: sql<
					string | null
				>`CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.mainColor} ELSE ${bookMetadata.mainColor} END`,
				addedAt: book.createdAt,
				mediaType: library.mediaType,
				totalHits: sql<number>`COUNT(*) OVER()::int`,
				ebookHits: sql<number>`COUNT(*) FILTER (WHERE ${library.mediaType} = 'ebook') OVER()::int`,
				audiobookHits: sql<number>`COUNT(*) FILTER (WHERE ${library.mediaType} = 'audiobook') OVER()::int`,
			})
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.leftJoin(audiobookMetadata, eq(audiobookMetadata.bookId, book.id))
			.$dynamic();
		let scopedQuery = query;
		if (compiled.personalJoins.includes("liked")) {
			scopedQuery = scopedQuery.leftJoin(
				likedBook,
				and(
					eq(likedBook.bookId, book.id),
					eq(likedBook.userId, context.viewerId),
					eq(likedBook.serverId, context.serverId),
				),
			);
		}
		if (compiled.personalJoins.includes("progress")) {
			scopedQuery = scopedQuery
				.leftJoin(
					readingProgress,
					and(
						eq(readingProgress.bookId, book.id),
						eq(readingProgress.userId, context.viewerId),
					),
				)
				.leftJoin(
					listeningProgress,
					and(
						eq(listeningProgress.bookId, book.id),
						eq(listeningProgress.userId, context.viewerId),
					),
				);
		}
		if (compiled.personalJoins.includes("shelf")) {
			scopedQuery = scopedQuery
				.leftJoin(
					userBookShelf,
					and(
						eq(userBookShelf.bookId, book.id),
						eq(userBookShelf.userId, context.viewerId),
					),
				)
				.leftJoin(
					userAudiobookShelf,
					and(
						eq(userAudiobookShelf.bookId, book.id),
						eq(userAudiobookShelf.userId, context.viewerId),
					),
				);
		}
		return scopedQuery
			.where(compiled.where)
			.orderBy(...compiled.orderBy)
			.limit(options.limit)
			.offset(options.offset);
	}

	async listManualItems(
		collectionId: string,
		serverId: string,
		accessibleLibraryIds: number[] | "ALL",
		options: { limit: number; offset: number; query?: string },
	) {
		const scopeCondition =
			accessibleLibraryIds === "ALL"
				? undefined
				: accessibleLibraryIds.length === 0
					? sql`false`
					: inArray(book.libraryId, accessibleLibraryIds);
		const query = options.query?.trim();
		return db
			.select({
				id: book.id,
				uuid: book.uuid,
				filename: book.filename,
				title: sql<
					string | null
				>`CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.title} ELSE ${bookMetadata.title} END`,
				cover: sql<
					string | null
				>`CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.cover} ELSE ${bookMetadata.cover} END`,
				mainColor: sql<
					string | null
				>`CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.mainColor} ELSE ${bookMetadata.mainColor} END`,
				addedAt: collectionBook.addedAt,
				mediaType: library.mediaType,
				totalHits: sql<number>`COUNT(*) OVER()::int`,
				ebookHits: sql<number>`COUNT(*) FILTER (WHERE ${library.mediaType} = 'ebook') OVER()::int`,
				audiobookHits: sql<number>`COUNT(*) FILTER (WHERE ${library.mediaType} = 'audiobook') OVER()::int`,
			})
			.from(collectionBook)
			.innerJoin(collection, eq(collection.id, collectionBook.collectionId))
			.innerJoin(book, eq(book.id, collectionBook.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.leftJoin(audiobookMetadata, eq(audiobookMetadata.bookId, book.id))
			.where(
				and(
					eq(collection.id, collectionId),
					eq(collection.serverId, serverId),
					eq(collection.kind, "manual"),
					eq(library.serverId, serverId),
					isNull(book.duplicateOfBookId),
					scopeCondition,
					query
						? or(
								ilike(book.filename, `%${query}%`),
								ilike(bookMetadata.title, `%${query}%`),
								ilike(audiobookMetadata.title, `%${query}%`),
							)
						: undefined,
				),
			)
			.orderBy(desc(collectionBook.addedAt), asc(book.id))
			.limit(options.limit)
			.offset(options.offset);
	}

	async updateDynamicDefinition(
		collectionId: string,
		userId: string,
		serverId: string,
		input: {
			name: string;
			description: string | null;
			isPublic: boolean;
			dynamicDefinition: DynamicCollectionDefinitionV1;
		},
	) {
		const [updated] = await db
			.update(collection)
			.set({
				...input,
				updatedAt: sql`NOW()`,
			})
			.where(
				and(
					eq(collection.id, collectionId),
					eq(collection.userId, userId),
					eq(collection.serverId, serverId),
					eq(collection.kind, "dynamic"),
				),
			)
			.returning();
		return updated ?? null;
	}

	async rename(collectionId: string, name: string) {
		await db
			.update(collection)
			.set({ name, updatedAt: sql`NOW()` })
			.where(eq(collection.id, collectionId));
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
