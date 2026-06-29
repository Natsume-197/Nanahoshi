import type { library, libraryPath } from "@nanahoshi-v2/db/schema/general";
import z from "zod";

// Per-library overrides layered over the org defaults. Amazon domain follows
// the library's language.
export const MetadataConfigSchema = z.object({
	amazon: z
		.object({
			domain: z.string().min(1).optional(),
		})
		.optional(),
});

export type MetadataConfig = z.infer<typeof MetadataConfigSchema>;

const LibrarySchema = z.object({
	id: z.number().int().nonnegative(),
	name: z.string().nullable().optional(),
	isCronWatch: z.boolean().nullable().optional(),
	scanIntervalMinutes: z.number().int().positive().nullable().optional(),
	isPublic: z.boolean(),
	mediaType: z.enum(["ebook", "audiobook"]).default("ebook"),
	metadataProviders: z.array(z.string()).default(["ranobedb", "amazon"]),
	metadataConfig: MetadataConfigSchema.default({}),
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

// ─── Procedure Input Schemas ─────────────────────────────
export const CreateLibraryInputSchema = z.object({
	name: z.string().min(1, "Library name is required"),
	isCronWatch: z.boolean().default(false),
	scanIntervalMinutes: z.number().int().positive().nullable().optional(),
	isPublic: z.boolean().default(false),
	mediaType: z.enum(["ebook", "audiobook"]).default("ebook"),
	metadataProviders: z
		.array(z.enum(["ranobedb", "amazon"]))
		.default(["ranobedb", "amazon"]),
	metadataConfig: MetadataConfigSchema.optional(),
	paths: z.array(z.string()).optional(),
});

export const GetLibraryByIdInput = z.object({
	id: z.number().int().nonnegative(),
});

export const AddPathInput = z.object({
	libraryId: z.number().int().nonnegative(),
	path: z.string().min(1),
});

export const RemovePathInput = z.object({
	pathId: z.number().int().nonnegative(),
});

export const UpdateLibraryInput = z.object({
	id: z.number().int().nonnegative(),
	name: z.string().min(1).optional(),
	isCronWatch: z.boolean().optional(),
	scanIntervalMinutes: z.number().int().positive().nullable().optional(),
	isPublic: z.boolean().optional(),
	metadataProviders: z.array(z.enum(["ranobedb", "amazon"])).optional(),
	metadataConfig: MetadataConfigSchema.optional(),
});

export const SetPathEnabledInput = z.object({
	pathId: z.number().int().nonnegative(),
	enabled: z.boolean(),
});

export const DeleteLibraryInput = z.object({
	id: z.number().int().nonnegative(),
});

export const ScanLibraryInput = z.object({
	libraryId: z.number().int().nonnegative(),
});

export type Library = typeof library.$inferSelect;
export type CreateLibraryInput = typeof library.$inferInsert;

export type LibraryPath = typeof libraryPath.$inferSelect;
export type CreateLibraryPathInput = typeof libraryPath.$inferInsert;

export type LibraryComplete = z.infer<typeof LibraryWithPathsSchema>;
