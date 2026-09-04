import {
	BadRequestError,
	ConflictError,
	ForbiddenError,
	InternalServerError,
	NotFoundError,
} from "../../errors";
import type { LibraryScope } from "../_shared/library-scope";
import { bookRepository } from "../books/book.repository";
import {
	type DynamicCollectionDefinitionV1,
	isPersonalizedCollectionDefinition,
	normalizeCollectionTimeZone,
	parseDynamicCollectionDefinition,
} from "./collection-rules";
import { collectionsRepository } from "./collections.repository";

type CreateCollectionInput = {
	name: string;
	description?: string;
	isPublic: boolean;
	addBookUuid?: string;
	kind?: "manual" | "dynamic";
	definition?: unknown;
};

function normalizeCollectionName(name: string): string {
	return name.trim().replace(/\s+/g, " ");
}

function normalizeOptionalDescription(description?: string): string | null {
	if (!description) return null;
	const normalized = description.trim();
	return normalized.length > 0 ? normalized : null;
}

function collectManualCollectionIds(definition: DynamicCollectionDefinitionV1) {
	const ids = new Set<string>();
	const visit = (group: DynamicCollectionDefinitionV1["root"]) => {
		for (const child of group.children) {
			if (child.kind === "group") visit(child);
			else if (
				child.field === "manualCollection" &&
				Array.isArray(child.value)
			) {
				for (const value of child.value) {
					if (typeof value === "object" && value && "id" in value)
						ids.add(value.id);
				}
			}
		}
	};
	visit(definition.root);
	return [...ids];
}

async function assertCollectionReferences(
	definition: DynamicCollectionDefinitionV1,
	userId: string,
	serverId: string,
	isPublic: boolean,
) {
	const ids = collectManualCollectionIds(definition);
	const rows = await collectionsRepository.listManualReferences(ids, serverId);
	if (
		rows.length !== ids.length ||
		rows.some((row) => row.userId !== userId && !row.isPublic)
	) {
		throw new BadRequestError(
			"A rule references a collection that is unavailable",
		);
	}
	if (isPublic && rows.some((row) => !row.isPublic)) {
		throw new BadRequestError(
			"Public dynamic collections can only reference public collections",
		);
	}
}

export const listCollections = async (
	userId: string,
	serverId: string,
	accessibleLibraryIds: number[] | "ALL" = "ALL",
) => {
	const rows = await collectionsRepository.listByUser(userId, serverId);
	return rows.map((row) => scopeCollectionSummary(row, accessibleLibraryIds));
};

export const listCollectionRuleOptions = (
	userId: string,
	input: {
		field:
			| "author"
			| "narrator"
			| "publisher"
			| "series"
			| "genre"
			| "tag"
			| "library"
			| "manualCollection";
		query: string;
		limit: number;
	},
	serverId: string,
	accessibleLibraryIds: number[] | "ALL",
) =>
	collectionsRepository.listRuleOptions(
		input.field,
		input.query,
		input.limit,
		userId,
		serverId,
		accessibleLibraryIds,
	);

export const listPublicCollections = async (
	username: string,
	serverId: string,
	limit?: number,
	accessibleLibraryIds: number[] | "ALL" = "ALL",
) => {
	const rows = await collectionsRepository.listPublicByUsername(
		username,
		serverId,
		limit ?? 4,
	);
	return rows.map((row) => scopeCollectionSummary(row, accessibleLibraryIds));
};

export const searchCollections = async (
	userId: string,
	serverId: string,
	query: string,
	limit?: number,
	accessibleLibraryIds: number[] | "ALL" = "ALL",
) => {
	const rows = await collectionsRepository.search(
		query,
		serverId,
		userId,
		limit ?? 10,
	);
	return rows.map((row) => scopeCollectionSummary(row, accessibleLibraryIds));
};

function redactUnscopedSummary<T extends Record<string, unknown>>(row: T): T {
	return {
		...row,
		...(Object.hasOwn(row, "bookCount") ? { bookCount: null } : {}),
		...(Object.hasOwn(row, "ebookCount") ? { ebookCount: null } : {}),
		...(Object.hasOwn(row, "audiobookCount") ? { audiobookCount: null } : {}),
		...(Object.hasOwn(row, "previewCovers") ? { previewCovers: [] } : {}),
		...(Object.hasOwn(row, "ebookPreviewCovers")
			? { ebookPreviewCovers: [] }
			: {}),
		...(Object.hasOwn(row, "audiobookPreviewCovers")
			? { audiobookPreviewCovers: [] }
			: {}),
	} as T;
}

function scopeCollectionSummary<
	T extends {
		kind: "manual" | "dynamic";
		dynamicDefinition?: unknown;
	} & Record<string, unknown>,
>(row: T, accessibleLibraryIds: number[] | "ALL") {
	const canUseStoredSummary =
		accessibleLibraryIds === "ALL" && row.kind === "manual";
	return decorateCollectionDefinition(
		canUseStoredSummary ? row : redactUnscopedSummary(row),
	);
}

export const getCollectionDetails = async (
	userId: string,
	collectionId: string,
	serverId: string,
	accessibleLibraryIds: number[] | "ALL" = "ALL",
) => {
	// Any collection the viewer is allowed to see: their own (public or private)
	// or another member's public one. `isOwner` on the summary gates mutations.
	const collection = await collectionsRepository.getPublicSummaryById(
		collectionId,
		serverId,
		userId,
	);
	if (!collection) {
		throw new NotFoundError("Collection not found");
	}

	const decoratedCollection = scopeCollectionSummary(
		collection,
		accessibleLibraryIds,
	);
	return {
		collection: decoratedCollection,
		// Items live behind the bounded listItems endpoint for both collection kinds.
		books: [],
	};
};

function decorateCollectionDefinition<
	T extends { kind: "manual" | "dynamic"; dynamicDefinition?: unknown },
>(collection: T) {
	if (collection.kind === "manual") {
		return {
			...collection,
			dynamicDefinition: null,
			definitionStatus: "notApplicable" as const,
			isPersonalized: false,
		};
	}
	try {
		const definition = parseDynamicCollectionDefinition(
			collection.dynamicDefinition,
		);
		return {
			...collection,
			dynamicDefinition: definition,
			definitionStatus: "valid" as const,
			isPersonalized: isPersonalizedCollectionDefinition(definition),
		};
	} catch {
		return {
			...collection,
			dynamicDefinition: null,
			definitionStatus: "invalid" as const,
			isPersonalized: false,
		};
	}
}

async function attachAuthors<
	T extends { id: number | bigint; [key: string]: unknown },
>(books: T[]) {
	const authorRows = await collectionsRepository.listAuthorsByBookIds(
		books.map((book) => Number(book.id)),
	);
	const authorsByBookId = new Map<number, { id: number; name: string }[]>();
	for (const row of authorRows) {
		const key = Number(row.bookId);
		const current = authorsByBookId.get(key) ?? [];
		current.push({ id: row.authorId, name: row.name });
		authorsByBookId.set(key, current);
	}
	return stripCollectionItemCounts(books).map((book) => ({
		...book,
		authors: authorsByBookId.get(Number(book.id)) ?? [],
	}));
}

function stripCollectionItemCounts<
	T extends { id: number | bigint; [key: string]: unknown },
>(rows: T[]) {
	return rows.map(
		({
			totalHits: _totalHits,
			ebookHits: _ebookHits,
			audiobookHits: _audiobookHits,
			...row
		}) => row,
	);
}

type CollectionItemRow = Omit<
	Awaited<ReturnType<typeof collectionsRepository.listDynamicItems>>[number],
	"addedAt"
> & { addedAt: string | null };

export const listCollectionItems = async (
	userId: string,
	input: {
		collectionId: string;
		query?: string;
		timeZone?: string;
		cursor: number;
		limit: number;
	},
	serverId: string,
	accessibleLibraryIds: number[] | "ALL",
) => {
	const collection = await collectionsRepository.getPublicSummaryById(
		input.collectionId,
		serverId,
		userId,
	);
	if (!collection) throw new NotFoundError("Collection not found");

	const timeZone = normalizeCollectionTimeZone(input.timeZone);
	let rows: CollectionItemRow[] = [];
	let definitionStatus: "valid" | "invalid" | "notApplicable" = "notApplicable";
	if (collection.kind === "dynamic") {
		let definition: DynamicCollectionDefinitionV1;
		try {
			definition = parseDynamicCollectionDefinition(
				collection.dynamicDefinition,
			);
		} catch {
			definitionStatus = "invalid";
			return {
				items: [],
				pagination: {
					nextCursor: undefined,
					hasMore: false,
					totalHits: 0,
					ebookHits: 0,
					audiobookHits: 0,
				},
				timeZone,
				definitionStatus,
			};
		}
		definitionStatus = "valid";
		rows = await collectionsRepository.listDynamicItems(
			definition,
			{
				viewerId: userId,
				serverId,
				accessibleLibraryIds,
				timeZone,
				query: input.query,
				randomSeed: input.collectionId,
			},
			{ limit: input.limit, offset: input.cursor },
		);
	} else {
		rows = await collectionsRepository.listManualItems(
			input.collectionId,
			serverId,
			accessibleLibraryIds,
			{
				limit: input.limit,
				offset: input.cursor,
				query: input.query,
			},
		);
	}
	const totalHits = Number(rows[0]?.totalHits ?? 0);
	const items = await attachAuthors(rows);
	const nextCursor = input.cursor + rows.length;
	return {
		items,
		pagination: {
			nextCursor: nextCursor < totalHits ? nextCursor : undefined,
			hasMore: nextCursor < totalHits,
			totalHits,
			ebookHits: Number(rows[0]?.ebookHits ?? 0),
			audiobookHits: Number(rows[0]?.audiobookHits ?? 0),
		},
		timeZone,
		definitionStatus,
	};
};

export const previewDynamicCollection = async (
	userId: string,
	input: { definition: unknown; timeZone?: string; limit: number },
	serverId: string,
	accessibleLibraryIds: number[] | "ALL",
) => {
	let definition: DynamicCollectionDefinitionV1;
	try {
		definition = parseDynamicCollectionDefinition(input.definition, {
			allowEmpty: true,
		});
	} catch {
		throw new BadRequestError("Fix the incomplete collection rules");
	}
	const timeZone = normalizeCollectionTimeZone(input.timeZone);
	const rows = await collectionsRepository.listDynamicItems(
		definition,
		{
			viewerId: userId,
			serverId,
			accessibleLibraryIds,
			timeZone,
			randomSeed: "preview",
		},
		{ limit: input.limit, offset: 0 },
	);
	return {
		count: Number(rows[0]?.totalHits ?? 0),
		sample: stripCollectionItemCounts(rows),
		isPersonalized: isPersonalizedCollectionDefinition(definition),
		timeZone,
	};
};

export const updateDynamicCollection = async (
	userId: string,
	input: {
		collectionId: string;
		name: string;
		description?: string;
		isPublic: boolean;
		definition: unknown;
	},
	serverId: string,
	canMakePublic: boolean,
) => {
	const target = await collectionsRepository.getByIdForUser(
		input.collectionId,
		userId,
		serverId,
	);
	if (target?.kind !== "dynamic") {
		throw new NotFoundError("Dynamic Collection not found");
	}
	if (target.isPublic !== input.isPublic && !canMakePublic) {
		throw new ForbiddenError("Missing permission: collection:makePublic");
	}
	const name = normalizeCollectionName(input.name);
	if (!name) throw new BadRequestError("Collection name is required");
	if (name !== target.name) {
		const duplicate = await collectionsRepository.findByName(
			userId,
			serverId,
			name,
		);
		if (duplicate) {
			throw new ConflictError("A collection with this name already exists");
		}
	}
	let definition: DynamicCollectionDefinitionV1;
	try {
		definition = parseDynamicCollectionDefinition(input.definition);
	} catch {
		throw new BadRequestError("Fix the incomplete collection rules");
	}
	await assertCollectionReferences(
		definition,
		userId,
		serverId,
		input.isPublic,
	);
	const updated = await collectionsRepository.updateDynamicDefinition(
		input.collectionId,
		userId,
		serverId,
		{
			name,
			description: normalizeOptionalDescription(input.description),
			isPublic: input.isPublic,
			dynamicDefinition: definition,
		},
	);
	if (!updated) throw new NotFoundError("Dynamic Collection not found");
	return decorateCollectionDefinition(updated);
};

export const previewCollectionBatch = async (
	userId: string,
	input: { collectionIds: string[]; timeZone?: string },
	serverId: string,
	accessibleLibraryIds: number[] | "ALL",
) => {
	const previewConcurrency = 8;
	const results: Array<{
		collectionId: string;
		count: number | null;
		ebookCount: number | null;
		audiobookCount: number | null;
		previewCovers: string[];
		status: "ready" | "invalid" | "notFound";
	}> = [];
	const visibleCollections =
		await collectionsRepository.listVisibleSummariesByIds(
			input.collectionIds,
			serverId,
			userId,
		);
	const collectionsById = new Map(
		visibleCollections.map((collection) => [collection.id, collection]),
	);
	const timeZone = normalizeCollectionTimeZone(input.timeZone);
	let cursor = 0;
	const workers = Array.from(
		{ length: Math.min(previewConcurrency, input.collectionIds.length) },
		async () => {
			while (cursor < input.collectionIds.length) {
				const index = cursor++;
				const collectionId = input.collectionIds[index];
				if (!collectionId) continue;
				try {
					const collection = collectionsById.get(collectionId);
					if (!collection) throw new NotFoundError("Collection not found");
					let rows: CollectionItemRow[];
					if (collection.kind === "dynamic") {
						let definition: DynamicCollectionDefinitionV1;
						try {
							definition = parseDynamicCollectionDefinition(
								collection.dynamicDefinition,
							);
						} catch {
							results[index] = {
								collectionId,
								count: null,
								ebookCount: null,
								audiobookCount: null,
								previewCovers: [],
								status: "invalid",
							};
							continue;
						}
						rows = await collectionsRepository.listDynamicItems(
							definition,
							{
								viewerId: userId,
								serverId,
								accessibleLibraryIds,
								timeZone,
								randomSeed: collectionId,
							},
							{ limit: 5, offset: 0 },
						);
					} else {
						rows = await collectionsRepository.listManualItems(
							collectionId,
							serverId,
							accessibleLibraryIds,
							{ limit: 5, offset: 0 },
						);
					}
					results[index] = {
						collectionId,
						count: Number(rows[0]?.totalHits ?? 0),
						ebookCount: Number(rows[0]?.ebookHits ?? 0),
						audiobookCount: Number(rows[0]?.audiobookHits ?? 0),
						previewCovers: rows
							.map((item) => item.cover)
							.filter((cover): cover is string => typeof cover === "string"),
						status: "ready",
					};
				} catch (error) {
					results[index] = {
						collectionId,
						count: null,
						ebookCount: null,
						audiobookCount: null,
						previewCovers: [],
						status: error instanceof NotFoundError ? "notFound" : "invalid",
					};
				}
			}
		},
	);
	await Promise.all(workers);
	return results;
};

export const createCollection = async (
	userId: string,
	input: CreateCollectionInput,
	serverId: string,
	scope: LibraryScope = "ALL",
) => {
	const normalizedName = normalizeCollectionName(input.name);
	if (!normalizedName) {
		throw new BadRequestError("Collection name is required");
	}

	const existing = await collectionsRepository.findByName(
		userId,
		serverId,
		normalizedName,
	);
	if (existing) {
		throw new ConflictError("A collection with this name already exists");
	}
	const kind = input.kind ?? "manual";
	if (kind === "manual" && input.definition !== undefined) {
		throw new BadRequestError("Manual collections cannot have dynamic rules");
	}
	if (kind === "dynamic" && input.addBookUuid) {
		throw new BadRequestError("Dynamic collections cannot add a fixed book");
	}
	let dynamicDefinition: DynamicCollectionDefinitionV1 | null = null;
	if (kind === "dynamic") {
		try {
			dynamicDefinition = parseDynamicCollectionDefinition(input.definition);
		} catch {
			throw new BadRequestError(
				"Choose at least one complete rule for this Dynamic Collection",
			);
		}
		await assertCollectionReferences(
			dynamicDefinition,
			userId,
			serverId,
			input.isPublic,
		);
	}

	const created = await collectionsRepository.create({
		userId,
		serverId,
		name: normalizedName,
		description: normalizeOptionalDescription(input.description),
		isPublic: input.isPublic,
		kind,
		dynamicDefinition,
	});
	if (!created) {
		throw new InternalServerError("Failed to create collection");
	}

	if (input.addBookUuid) {
		const bookRecord = await bookRepository.getByUuid(
			input.addBookUuid,
			serverId,
			scope,
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
	serverId: string,
) => {
	const target = await collectionsRepository.getByIdForUser(
		input.collectionId,
		userId,
		serverId,
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
			serverId,
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
	serverId: string,
) => {
	const target = await collectionsRepository.getByIdForUser(
		collectionId,
		userId,
		serverId,
	);
	if (!target) {
		throw new NotFoundError("Collection not found");
	}

	await collectionsRepository.deleteByIdForUser(collectionId, userId, serverId);
	return { success: true };
};

export const listBookMemberships = async (
	userId: string,
	bookUuid: string,
	serverId: string,
	scope: LibraryScope = "ALL",
) => {
	const bookRecord = await bookRepository.getByUuid(bookUuid, serverId, scope);
	if (!bookRecord) {
		throw new NotFoundError("Book not found");
	}

	return collectionsRepository.listBookMembershipsByBookId(
		userId,
		serverId,
		Number(bookRecord.id),
	);
};

export const setBookMembership = async (
	userId: string,
	input: { collectionId: string; bookUuid: string; inCollection: boolean },
	serverId: string,
	scope: LibraryScope = "ALL",
) => {
	const targetCollection = await collectionsRepository.getByIdForUser(
		input.collectionId,
		userId,
		serverId,
	);
	if (!targetCollection) {
		throw new NotFoundError("Collection not found");
	}
	if (targetCollection.kind === "dynamic") {
		throw new ConflictError(
			"This Dynamic Collection is managed by rules and cannot be edited manually",
		);
	}

	const bookRecord = await bookRepository.getByUuid(
		input.bookUuid,
		serverId,
		scope,
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
	serverId: string,
) => {
	const target = await collectionsRepository.getByIdForUser(
		input.collectionId,
		userId,
		serverId,
	);
	if (!target) {
		throw new NotFoundError("Collection not found");
	}
	if (target.kind === "dynamic" && input.isPublic) {
		const definition = parseDynamicCollectionDefinition(
			target.dynamicDefinition,
		);
		await assertCollectionReferences(definition, userId, serverId, true);
	}

	await collectionsRepository.setVisibility(input.collectionId, input.isPublic);
	return { collectionId: input.collectionId, isPublic: input.isPublic };
};
