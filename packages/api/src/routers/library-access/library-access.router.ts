import { NotFoundError } from "../../errors";
import { requirePermission } from "../../index";
import {
	DeleteOverwriteInput,
	GetOverwritesInput,
	UpsertOverwriteInput,
} from "./library-access.model";
import { libraryAccessRepository } from "./library-access.repository";

export const libraryAccessRouter = {
	getOverwrites: requirePermission("library", "manageAccess")
		.input(GetOverwritesInput)
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
		.input(UpsertOverwriteInput)
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
		.input(DeleteOverwriteInput)
		.handler(async ({ input, context }) => {
			const deleted = await libraryAccessRepository.delete(
				input.id,
				context.organizationId,
			);
			if (!deleted) throw new NotFoundError("Overwrite not found");
			return { success: true };
		}),
};
