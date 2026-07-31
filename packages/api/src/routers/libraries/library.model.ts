import type {
	library,
	libraryPath,
	MetadataProviderRouting,
	StoredMetadataProviders,
} from "@nanahoshi-v2/db/schema/general";
import z from "zod";
import { isBookMetadataProfileId } from "../../modules/metadataProfiles";
import { AUDIOBOOK_PROVIDER_IDS } from "../audiobooks/metadata/providers/provider.manifest";
import { BOOK_PROVIDER_IDS as EBOOK_PROVIDER_IDS } from "../books/metadata/providers/provider.manifest";

export { BOOK_PROVIDER_IDS as EBOOK_PROVIDER_IDS } from "../books/metadata/providers/provider.manifest";
export { AUDIOBOOK_PROVIDER_IDS };

const MetadataProviderIdSchema = z.enum([
	...EBOOK_PROVIDER_IDS,
	...AUDIOBOOK_PROVIDER_IDS,
]);

/**
 * The routing structure, parameterized by how strict the provider ids are.
 * Input validation passes the enum (reject unknown providers); the read path
 * passes a plain string so rows written by an older build still parse.
 */
const routingSchema = <T extends z.ZodType<string>>(providerId: T) =>
	z.union([
		z.array(providerId),
		z.object({
			order: z.array(providerId),
			fields: z.record(z.string(), z.array(providerId)).optional(),
			primary: providerId.optional(),
			profile: z
				.object({ id: z.string(), version: z.number().int().positive() })
				.optional(),
		}),
	]);

const StoredMetadataProvidersSchema = routingSchema(z.string());

// Write path: same structure, but provider ids must be known and the routing
// has to be internally consistent.
export const MetadataProvidersSchema = routingSchema(
	MetadataProviderIdSchema,
).superRefine((value, ctx) => {
	if (Array.isArray(value)) return;
	if (value.order.length === 0) {
		ctx.addIssue({
			code: "custom",
			path: ["order"],
			message: "At least one provider must be enabled",
		});
	}
	if (value.primary && !value.order.includes(value.primary)) {
		ctx.addIssue({
			code: "custom",
			path: ["primary"],
			message: "Primary provider must be enabled in the provider order",
		});
	}
	if (value.profile && !isBookMetadataProfileId(value.profile.id)) {
		ctx.addIssue({
			code: "custom",
			path: ["profile", "id"],
			message: "Unknown metadata profile",
		});
	}
});

export type MetadataProvidersConfig = z.infer<typeof MetadataProvidersSchema>;

// Compile-time proof that what we validate is what we store: if the zod schema
// and StoredMetadataProviders ever drift apart, this line stops the build.
type AssertAssignable<T extends U, U> = T;
export type ValidatedConfigFitsStorage = AssertAssignable<
	MetadataProvidersConfig,
	StoredMetadataProviders
>;

/** Every provider id referenced by a config, regardless of shape. */
export function providersInConfig(
	config: StoredMetadataProviders | null | undefined,
): string[] {
	if (!config) return [];
	if (Array.isArray(config)) return config;
	return [
		...config.order,
		...(config.primary ? [config.primary] : []),
		...Object.values(config.fields ?? {}).flat(),
	];
}

export function profileInConfig(
	config: MetadataProvidersConfig | null | undefined,
) {
	return config && !Array.isArray(config) ? config.profile : undefined;
}

export function allowedProvidersFor(
	mediaType: "ebook" | "audiobook",
): readonly string[] {
	return mediaType === "audiobook"
		? AUDIOBOOK_PROVIDER_IDS
		: EBOOK_PROVIDER_IDS;
}

/**
 * Removes providers from a stored config across all shapes (order, per-field
 * overrides, primary), normalizing to the routed form. Returns null if it would
 * leave the library with no providers (never disable the last one). `changed`
 * is false when none of them were enabled, so callers can stay idempotent.
 * An empty list is a pure normalization pass.
 */
export function removeProvidersFromConfig(
	config: StoredMetadataProviders | null | undefined,
	providers: readonly string[],
	defaultOrder: readonly string[],
): { config: MetadataProvidersConfig; changed: boolean } | null {
	// Work in plain strings; the caller only feeds provider ids already valid for
	// the library, and the result is re-validated by MetadataProvidersSchema.
	const drop = new Set(providers);
	const raw = config;
	const currentOrder =
		raw == null
			? [...defaultOrder]
			: Array.isArray(raw)
				? raw
				: raw.order.length > 0
					? raw.order
					: [...defaultOrder];
	const nextOrder = currentOrder.filter((id) => !drop.has(id));
	if (nextOrder.length === 0) return null;

	if (raw == null || Array.isArray(raw)) {
		return {
			config: nextOrder as MetadataProvidersConfig,
			changed: nextOrder.length !== currentOrder.length,
		};
	}

	const fieldEntries = Object.entries(raw.fields ?? {})
		.map(([field, ids]) => [field, ids.filter((id) => !drop.has(id))] as const)
		.filter(([, ids]) => ids.length > 0);
	const primaryRemoved = raw.primary != null && drop.has(raw.primary);
	const fieldsChanged = Object.values(raw.fields ?? {}).some((ids) =>
		ids.some((id) => drop.has(id)),
	);
	const changed =
		nextOrder.length !== currentOrder.length || primaryRemoved || fieldsChanged;

	const next: MetadataProviderRouting = { order: nextOrder };
	if (fieldEntries.length > 0) {
		next.fields = Object.fromEntries(
			fieldEntries.map(([field, ids]) => [field, [...ids]]),
		);
	}
	if (raw.primary && !primaryRemoved) next.primary = raw.primary;
	if (raw.profile) next.profile = raw.profile;
	return { config: next as MetadataProvidersConfig, changed };
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
	// Output shape: unvalidated ids on purpose, so a row written by an older
	// build still reads back. Structure comes from StoredMetadataProviders.
	metadataProviders: StoredMetadataProvidersSchema.default([
		...EBOOK_PROVIDER_IDS,
	]),
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
		if (
			val.mediaType === "audiobook" &&
			profileInConfig(val.metadataProviders)
		) {
			ctx.addIssue({
				code: "custom",
				path: ["metadataProviders", "profile"],
				message:
					"Metadata profiles are currently available for ebook libraries",
			});
		}
	});

export const GetLibraryByIdInput = z.object({
	id: z.number().int().nonnegative(),
});

export const GetLibraryByUuidInput = z.object({
	uuid: z.string().uuid(),
});

export const GetPathHealthInput = z.object({
	libraryUuid: z.string().uuid(),
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
	// Incremental is the everyday operation; full is the explicit correctness
	// reconciliation for filesystems that do not update directory mtimes when a
	// file is overwritten in place.
	mode: z.enum(["incremental", "full"]).default("incremental"),
});

export const SetAutoEnrichPausedInput = z.object({
	libraryUuid: z.string().uuid(),
	paused: z.boolean(),
});

export const SetAllAutoEnrichPausedInput = z.object({
	paused: z.boolean(),
});

export type Library = typeof library.$inferSelect;
export type CreateLibraryInput = typeof library.$inferInsert;

export type LibraryPath = typeof libraryPath.$inferSelect;
export type CreateLibraryPathInput = typeof libraryPath.$inferInsert;

export type LibraryComplete = z.infer<typeof LibraryWithPathsSchema>;
