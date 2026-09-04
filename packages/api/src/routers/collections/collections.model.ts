import { z } from "zod";
import {
	DynamicCollectionDefinitionSchema,
	DynamicCollectionDraftSchema,
} from "./collection-rules";

export const CreateCollectionInput = z
	.object({
		name: z.string().trim().min(1).max(80),
		description: z.string().trim().max(280).optional(),
		isPublic: z.boolean().default(false),
		addBookUuid: z.string().optional(),
		kind: z.enum(["manual", "dynamic"]).default("manual"),
		definition: DynamicCollectionDefinitionSchema.optional(),
	})
	.superRefine((input, ctx) => {
		if (input.kind === "dynamic" && !input.definition) {
			ctx.addIssue({
				code: "custom",
				path: ["definition"],
				message: "Dynamic Collections need rules",
			});
		}
		if (input.kind === "manual" && input.definition) {
			ctx.addIssue({
				code: "custom",
				path: ["definition"],
				message: "Manual collections cannot have rules",
			});
		}
		if (input.kind === "dynamic" && input.addBookUuid) {
			ctx.addIssue({
				code: "custom",
				path: ["addBookUuid"],
				message: "Dynamic Collections cannot add a fixed book",
			});
		}
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

export const UpdateDynamicCollectionInput = z.object({
	collectionId: z.string().uuid(),
	name: z.string().trim().min(1).max(80),
	description: z.string().trim().max(280).optional(),
	isPublic: z.boolean(),
	definition: DynamicCollectionDefinitionSchema,
});

export const PreviewDynamicCollectionInput = z.object({
	definition: DynamicCollectionDraftSchema,
	timeZone: z.string().trim().max(100).optional(),
	limit: z.number().int().min(1).max(6).default(6),
});

export const ListCollectionItemsInput = z.object({
	collectionId: z.string().uuid(),
	query: z.string().trim().max(200).optional(),
	timeZone: z.string().trim().max(100).optional(),
	cursor: z.number().int().min(0).default(0),
	limit: z.number().int().min(1).max(50).default(30),
});

export const PreviewCollectionBatchInput = z.object({
	collectionIds: z.array(z.string().uuid()).min(1).max(100),
	timeZone: z.string().trim().max(100).optional(),
});

export const ListCollectionRuleOptionsInput = z.object({
	field: z.enum([
		"author",
		"narrator",
		"publisher",
		"series",
		"genre",
		"tag",
		"library",
		"manualCollection",
	]),
	query: z.string().trim().max(100).default(""),
	limit: z.number().int().min(1).max(30).default(20),
});
