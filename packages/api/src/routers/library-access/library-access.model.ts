import { z } from "zod";
import { permissionMapSchema } from "../roles/roles.model";

const subjectTypeSchema = z.enum(["everyone", "role", "user"]);

export const GetOverwritesInput = z.object({
	libraryId: z.number().int().nonnegative(),
});

export const UpsertOverwriteInput = z
	.object({
		libraryId: z.number().int().nonnegative(),
		subjectType: subjectTypeSchema,
		subjectId: z.string().nullable().default(null),
		allow: permissionMapSchema.default({}),
		deny: permissionMapSchema.default({}),
	})
	.refine(
		(v) =>
			v.subjectType === "everyone"
				? v.subjectId === null
				: v.subjectId !== null,
		{
			message:
				"subjectId is required for role/user overwrites and must be null for everyone",
		},
	);

export const DeleteOverwriteInput = z.object({
	id: z.number().int().nonnegative(),
});
