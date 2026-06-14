import {
	BadRequestError,
	ConflictError,
	InternalServerError,
	NotFoundError,
} from "../../errors";
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
	organizationId: string,
) => {
	return collectionsRepository.listByUser(userId, organizationId);
};

export const getCollectionDetails = async (
	userId: string,
	collectionId: string,
	organizationId: string,
	accessibleLibraryIds: number[] | "ALL" = "ALL",
) => {
	const collection = await collectionsRepository.getSummaryByIdForUser(
		collectionId,
		userId,
		organizationId,
	);
	if (!collection) {
		throw new NotFoundError("Collection not found");
	}

	const books = await collectionsRepository.listBooksByCollectionForUser(
		collectionId,
		userId,
		organizationId,
		accessibleLibraryIds,
	);
	const authorRows = await collectionsRepository.listAuthorsByBookIds(
		books.map((book) => Number(book.id)),
	);
	const authorsByBookId = new Map<number, { id: number; name: string }[]>();
	for (const row of authorRows) {
		const key = Number(row.bookId);
		const current = authorsByBookId.get(key) ?? [];
		current.push({
			id: row.authorId,
			name: row.name,
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
	organizationId: string,
) => {
	const normalizedName = normalizeCollectionName(input.name);
	if (!normalizedName) {
		throw new BadRequestError("Collection name is required");
	}

	const existing = await collectionsRepository.findByName(
		userId,
		organizationId,
		normalizedName,
	);
	if (existing) {
		throw new ConflictError("A collection with this name already exists");
	}

	const created = await collectionsRepository.create({
		userId,
		organizationId,
		name: normalizedName,
		description: normalizeOptionalDescription(input.description),
		isPublic: input.isPublic,
	});
	if (!created) {
		throw new InternalServerError("Failed to create collection");
	}

	if (input.addBookUuid) {
		const bookRecord = await bookRepository.getByUuid(
			input.addBookUuid,
			organizationId,
		);
		if (!bookRecord) {
			throw new NotFoundError("Book not found");
		}

		await collectionsRepository.addBook(created.id, Number(bookRecord.id));
		await collectionsRepository.touch(created.id);
	}

	return created;
};

export const renameCollection = async (
	userId: string,
	input: { collectionId: string; name: string },
	organizationId: string,
) => {
	const target = await collectionsRepository.getByIdForUser(
		input.collectionId,
		userId,
		organizationId,
	);
	if (!target) {
		throw new NotFoundError("Collection not found");
	}

	const normalizedName = normalizeCollectionName(input.name);
	if (!normalizedName) {
		throw new BadRequestError("Collection name is required");
	}

	if (normalizedName !== target.name) {
		const existing = await collectionsRepository.findByName(
			userId,
			organizationId,
			normalizedName,
		);
		if (existing) {
			throw new ConflictError("A collection with this name already exists");
		}
	}

	await collectionsRepository.rename(input.collectionId, normalizedName);
	return { collectionId: input.collectionId, name: normalizedName };
};

export const deleteCollection = async (
	userId: string,
	collectionId: string,
	organizationId: string,
) => {
	const target = await collectionsRepository.getByIdForUser(
		collectionId,
		userId,
		organizationId,
	);
	if (!target) {
		throw new NotFoundError("Collection not found");
	}

	await collectionsRepository.deleteByIdForUser(
		collectionId,
		userId,
		organizationId,
	);
	return { success: true };
};

export const listBookMemberships = async (
	userId: string,
	bookUuid: string,
	organizationId: string,
) => {
	const bookRecord = await bookRepository.getByUuid(bookUuid, organizationId);
	if (!bookRecord) {
		throw new NotFoundError("Book not found");
	}

	return collectionsRepository.listBookMembershipsByBookId(
		userId,
		organizationId,
		Number(bookRecord.id),
	);
};

export const setBookMembership = async (
	userId: string,
	input: { collectionId: string; bookUuid: string; inCollection: boolean },
	organizationId: string,
) => {
	const targetCollection = await collectionsRepository.getByIdForUser(
		input.collectionId,
		userId,
		organizationId,
	);
	if (!targetCollection) {
		throw new NotFoundError("Collection not found");
	}

	const bookRecord = await bookRepository.getByUuid(
		input.bookUuid,
		organizationId,
	);
	if (!bookRecord) {
		throw new NotFoundError("Book not found");
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
	organizationId: string,
) => {
	const target = await collectionsRepository.getByIdForUser(
		input.collectionId,
		userId,
		organizationId,
	);
	if (!target) {
		throw new NotFoundError("Collection not found");
	}

	await collectionsRepository.setVisibility(input.collectionId, input.isPublic);
	return { collectionId: input.collectionId, isPublic: input.isPublic };
};
