import z from "zod";
import type { library, libraryPath } from "@nanahoshi-v2/db/schema/general";

const LibrarySchema = z.object({
	id: z.number().int().nonnegative(),
	name: z.string().nullable().optional(),
	isCronWatch: z.boolean().nullable().optional(),
	isPublic: z.boolean(),
	createdAt: z.string(),
});

const LibraryPathSchema = z.object({
	id: z.number().int().nonnegative(),
	libraryId: z.number().int().nonnegative(),
	path: z.string(),
	isEnabled: z.boolean().nullable().optional(),
	createdAt: z.string(),
});

export const LibraryWithPathsSchema = LibrarySchema.extend({
	paths: z.array(LibraryPathSchema).optional(),
});

export type Library = typeof library.$inferSelect;
export type CreateLibraryInput = typeof library.$inferInsert;

export type LibraryPath = typeof libraryPath.$inferSelect;
export type CreateLibraryPathInput = typeof libraryPath.$inferInsert;

export type LibraryComplete = z.infer<typeof LibraryWithPathsSchema>;
