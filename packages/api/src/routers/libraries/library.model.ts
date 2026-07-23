import type { library, libraryPath } from "@nanahoshi-v2/db/schema/general";
import z from "zod";
import { AUDIOBOOK_PROVIDER_IDS } from "../audiobooks/metadata/providers/provider.manifest";
import { BOOK_PROVIDER_IDS as EBOOK_PROVIDER_IDS } from "../books/metadata/providers/provider.manifest";

export { BOOK_PROVIDER_IDS as EBOOK_PROVIDER_IDS } from "../books/metadata/providers/provider.manifest";
export { AUDIOBOOK_PROVIDER_IDS };

const MetadataProviderIdSchema = z.enum([
	...EBOOK_PROVIDER_IDS,
	...AUDIOBOOK_PROVIDER_IDS,
]);

// Provider routing accepts both stored shapes: the legacy ordered array and
// the routed { order, fields } object (fields = per-field priority overrides).
const MetadataProviderRoutingSchema = z.object({
	order: z.array(MetadataProviderIdSchema).min(1),
	fields: z.record(z.string(), z.array(MetadataProviderIdSchema)).optional(),
});

export const MetadataProvidersSchema = z.union([
	z.array(MetadataProviderIdSchema),
	MetadataProviderRoutingSchema,
]);

export type MetadataProvidersConfig = z.infer<typeof MetadataProvidersSchema>;

/** Every provider id referenced by a config, regardless of shape. */
export function providersInConfig(
	config:
		| string[]
		| { order: string[]; fields?: Record<string, string[]> }
		| null
		| undefined,
): string[] {
	if (!config) return [];
	if (Array.isArray(config)) return config;
	return [...config.order, ...Object.values(config.fields ?? {}).flat()];
}

export function allowedProvidersFor(
	mediaType: "ebook" | "audiobook",
): readonly string[] {
	return mediaType === "audiobook"
		? AUDIOBOOK_PROVIDER_IDS
		: EBOOK_PROVIDER_IDS;
}

// Per-library overrides layered over the org defaults. Amazon domain follows
// the library's language; Audible region applies to audiobook libraries.
export const MetadataConfigSchema = z.object({
	amazon: z
		.object({
			domain: z.string().min(1).optional(),
		})
		.optional(),
	// region stays a plain string so DB reads (jsonb $type) stay assignable;
	// the UI only offers known Audible regions and unknown values fall back to us.
	audible: z
		.object({
			region: z.string().min(1).optional(),
		})
		.optional(),
});

export type MetadataConfig = z.infer<typeof MetadataConfigSchema>;

const LibrarySchema = z.object({
	id: z.number().int().nonnegative(),
	uuid: z.string().uuid(),
	name: z.string().nullable().optional(),
	isCronWatch: z.boolean().nullable().optional(),
	scanIntervalMinutes: z.number().int().positive().nullable().optional(),
	isPublic: z.boolean(),
	mediaType: z.enum(["ebook", "audiobook"]).default("ebook"),
	metadataProviders: z
		.union([
			z.array(z.string()),
			z.object({
				order: z.array(z.string()),
				fields: z.record(z.string(), z.array(z.string())).optional(),
			}),
		])
		.default([...EBOOK_PROVIDER_IDS]),
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
export const CreateLibraryInputSchema = z
	.object({
		name: z.string().min(1, "Library name is required"),
		isCronWatch: z.boolean().default(false),
		scanIntervalMinutes: z.number().int().positive().nullable().optional(),
		isPublic: z.boolean().default(false),
		mediaType: z.enum(["ebook", "audiobook"]).default("ebook"),
		// Default (per media type) is applied in library.service.createLibrary.
		metadataProviders: MetadataProvidersSchema.optional(),
		metadataConfig: MetadataConfigSchema.optional(),
		paths: z.array(z.string()).optional(),
	})
	.superRefine((val, ctx) => {
		const allowed = allowedProvidersFor(val.mediaType);
		for (const provider of providersInConfig(val.metadataProviders)) {
			if (!allowed.includes(provider)) {
				ctx.addIssue({
					code: "custom",
					path: ["metadataProviders"],
					message: `Provider "${provider}" is not valid for ${val.mediaType} libraries`,
				});
			}
		}
	});

export const GetLibraryByIdInput = z.object({
	id: z.number().int().nonnegative(),
});

export const GetLibraryByUuidInput = z.object({
	uuid: z.string().uuid(),
});

export const AddPathInput = z.object({
	libraryUuid: z.string().uuid(),
	path: z.string().min(1),
});

export const RemovePathInput = z.object({
	pathId: z.number().int().nonnegative(),
});

export const UpdateLibraryInput = z.object({
	uuid: z.string().uuid(),
	name: z.string().min(1).optional(),
	isCronWatch: z.boolean().optional(),
	scanIntervalMinutes: z.number().int().positive().nullable().optional(),
	isPublic: z.boolean().optional(),
	// Validated against the library's mediaType in library.service.updateLibrary.
	metadataProviders: MetadataProvidersSchema.optional(),
	metadataConfig: MetadataConfigSchema.optional(),
});

export const SetPathEnabledInput = z.object({
	pathId: z.number().int().nonnegative(),
	enabled: z.boolean(),
});

export const DeleteLibraryInput = z.object({
	uuid: z.string().uuid(),
});

export const ScanLibraryInput = z.object({
	libraryUuid: z.string().uuid(),
});

export type Library = typeof library.$inferSelect;
export type CreateLibraryInput = typeof library.$inferInsert;

export type LibraryPath = typeof libraryPath.$inferSelect;
export type CreateLibraryPathInput = typeof libraryPath.$inferInsert;

export type LibraryComplete = z.infer<typeof LibraryWithPathsSchema>;
