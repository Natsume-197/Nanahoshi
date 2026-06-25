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
					context.serverId,
				))
			) {
				throw new NotFoundError("Library not found");
			}
			return libraryAccessRepository.list(input.libraryId, context.serverId);
		}),

	upsertOverwrite: requirePermission("library", "manageAccess")
		.input(UpsertOverwriteInput)
		.handler(async ({ input, context }) => {
			if (
				!(await libraryAccessRepository.libraryInOrg(
					input.libraryId,
					context.serverId,
				))
			) {
				throw new NotFoundError("Library not found");
			}
			await libraryAccessRepository.upsert({
				libraryId: input.libraryId,
				serverId: context.serverId,
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
				context.serverId,
			);
			if (!deleted) throw new NotFoundError("Overwrite not found");
			return { success: true };
		}),
};
