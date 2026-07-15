import { z } from "zod";

export const CreateCollectionInput = z.object({
	name: z.string().trim().min(1).max(80),
	description: z.string().trim().max(280).optional(),
	isPublic: z.boolean().default(false),
	addBookUuid: z.string().optional(),
});

export const RenameCollectionInput = z.object({
	collectionId: z.string().uuid(),
	name: z.string().trim().min(1).max(80),
});

export const DeleteCollectionInput = z.object({
	collectionId: z.string().uuid(),
});

export const GetCollectionDetailsInput = z.object({
	collectionId: z.string().uuid(),
});

export const SearchCollectionsInput = z.object({
	query: z.string().trim().min(1),
	limit: z.number().int().min(1).max(20).optional(),
});

export const ListPublicCollectionsInput = z.object({
	username: z.string().trim().min(1),
	limit: z.number().int().min(1).max(12).optional(),
});

export const ListBookMembershipsInput = z.object({
	bookUuid: z.string(),
});

export const SetBookMembershipInput = z.object({
	collectionId: z.string().uuid(),
	bookUuid: z.string(),
	inCollection: z.boolean(),
});

export const UpdateCollectionVisibilityInput = z.object({
	collectionId: z.string().uuid(),
	isPublic: z.boolean(),
});
