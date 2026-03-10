import { ORPCError } from "@orpc/server";
import { bookRepository } from "../books/book.repository";
import { collectionsRepository } from "./collections.repository";

type CreateCollectionInput = {
	name: string;
	description?: string;
	isPublic: boolean;
	addBookUuid?: string;
};

function normalizeCollectionName(name: string): string {
	return name.trim().replace(/\s+/g, " ");
}

function normalizeOptionalDescription(description?: string): string | null {
	if (!description) return null;
	const normalized = description.trim();
	return normalized.length > 0 ? normalized : null;
}

export const listCollections = async (
	userId: string,
	organizationId?: string,
) => {
	return collectionsRepository.listByUser(userId, organizationId);
};

export const getCollectionDetails = async (
	userId: string,
	collectionId: string,
	organizationId?: string,
) => {
	const collection = await collectionsRepository.getSummaryByIdForUser(
		collectionId,
		userId,
		organizationId,
	);
	if (!collection) {
		throw new ORPCError("NOT_FOUND", { message: "Collection not found" });
	}

	const books = organizationId
		? await collectionsRepository.listBooksByCollectionForUser(
				collectionId,
				userId,
				organizationId,
			)
		: [];
	const authorRows = await collectionsRepository.listAuthorsByBookIds(
		books.map((book) => Number(book.id)),
	);
	const authorsByBookId = new Map<
		number,
		{ id: number; name: string; role: string }[]
	>();
	for (const row of authorRows) {
		const key = Number(row.bookId);
		const current = authorsByBookId.get(key) ?? [];
		current.push({
			id: row.authorId,
			name: row.name,
			role: row.role ?? "Author",
		});
		authorsByBookId.set(key, current);
	}

	return {
		collection,
		books: books.map((book) => ({
			...book,
			authors: authorsByBookId.get(Number(book.id)) ?? [],
		})),
	};
};

export const createCollection = async (
	userId: string,
	input: CreateCollectionInput,
	organizationId?: string,
) => {
	const normalizedName = normalizeCollectionName(input.name);
	if (!normalizedName) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Collection name is required",
		});
	}

	const existing = await collectionsRepository.findByName(
		userId,
		normalizedName,
	);
	if (existing) {
		throw new ORPCError("CONFLICT", {
			message: "A collection with this name already exists",
		});
	}

	const created = await collectionsRepository.create({
		userId,
		name: normalizedName,
		description: normalizeOptionalDescription(input.description),
		isPublic: input.isPublic,
	});
	if (!created) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Failed to create collection",
		});
	}

	if (input.addBookUuid) {
		const bookRecord = await bookRepository.getByUuid(
			input.addBookUuid,
			organizationId,
		);
		if (!bookRecord) {
			throw new ORPCError("NOT_FOUND", { message: "Book not found" });
		}

		await collectionsRepository.addBook(created.id, Number(bookRecord.id));
		await collectionsRepository.touch(created.id);
	}

	return created;
};

export const deleteCollection = async (
	userId: string,
	collectionId: string,
) => {
	const target = await collectionsRepository.getByIdForUser(
		collectionId,
		userId,
	);
	if (!target) {
		throw new ORPCError("NOT_FOUND", { message: "Collection not found" });
	}

	await collectionsRepository.deleteByIdForUser(collectionId, userId);
	return { success: true };
};

export const listBookMemberships = async (
	userId: string,
	bookUuid: string,
	organizationId?: string,
) => {
	const bookRecord = await bookRepository.getByUuid(bookUuid, organizationId);
	if (!bookRecord) {
		throw new ORPCError("NOT_FOUND", { message: "Book not found" });
	}

	return collectionsRepository.listBookMembershipsByBookId(
		userId,
		Number(bookRecord.id),
	);
};

export const setBookMembership = async (
	userId: string,
	input: { collectionId: string; bookUuid: string; inCollection: boolean },
	organizationId?: string,
) => {
	const targetCollection = await collectionsRepository.getByIdForUser(
		input.collectionId,
		userId,
	);
	if (!targetCollection) {
		throw new ORPCError("NOT_FOUND", { message: "Collection not found" });
	}

	const bookRecord = await bookRepository.getByUuid(
		input.bookUuid,
		organizationId,
	);
	if (!bookRecord) {
		throw new ORPCError("NOT_FOUND", { message: "Book not found" });
	}

	const bookId = Number(bookRecord.id);
	let changed = false;
	if (input.inCollection) {
		changed = await collectionsRepository.addBook(input.collectionId, bookId);
	} else {
		changed = await collectionsRepository.removeBook(
			input.collectionId,
			bookId,
		);
	}

	if (changed) {
		await collectionsRepository.touch(input.collectionId);
	}

	return {
		collectionId: input.collectionId,
		changed,
		inCollection: input.inCollection,
	};
};

export const updateCollectionVisibility = async (
	userId: string,
	input: { collectionId: string; isPublic: boolean },
) => {
	const target = await collectionsRepository.getByIdForUser(
		input.collectionId,
		userId,
	);
	if (!target) {
		throw new ORPCError("NOT_FOUND", { message: "Collection not found" });
	}

	await collectionsRepository.setVisibility(input.collectionId, input.isPublic);
	return { collectionId: input.collectionId, isPublic: input.isPublic };
};
