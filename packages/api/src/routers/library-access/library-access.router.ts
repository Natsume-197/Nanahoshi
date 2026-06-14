import { z } from "zod";
import { NotFoundError } from "../../errors";
import { requirePermission } from "../../index";
import { permissionMapSchema } from "../roles/roles.model";
import { libraryAccessRepository } from "./library-access.repository";

const subjectTypeSchema = z.enum(["everyone", "role", "user"]);

const upsertInput = z
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

export const libraryAccessRouter = {
	getOverwrites: requirePermission("library", "manageAccess")
		.input(z.object({ libraryId: z.number().int().nonnegative() }))
		.handler(async ({ input, context }) => {
			if (
				!(await libraryAccessRepository.libraryInOrg(
					input.libraryId,
					context.organizationId,
				))
			) {
				throw new NotFoundError("Library not found");
			}
			return libraryAccessRepository.list(
				input.libraryId,
				context.organizationId,
			);
		}),

	upsertOverwrite: requirePermission("library", "manageAccess")
		.input(upsertInput)
		.handler(async ({ input, context }) => {
			if (
				!(await libraryAccessRepository.libraryInOrg(
					input.libraryId,
					context.organizationId,
				))
			) {
				throw new NotFoundError("Library not found");
			}
			await libraryAccessRepository.upsert({
				libraryId: input.libraryId,
				organizationId: context.organizationId,
				subjectType: input.subjectType,
				subjectId: input.subjectId,
				allow: input.allow,
				deny: input.deny,
			});
			return { success: true };
		}),

	deleteOverwrite: requirePermission("library", "manageAccess")
		.input(z.object({ id: z.number().int().nonnegative() }))
		.handler(async ({ input, context }) => {
			const deleted = await libraryAccessRepository.delete(
				input.id,
				context.organizationId,
			);
			if (!deleted) throw new NotFoundError("Overwrite not found");
			return { success: true };
		}),
};
