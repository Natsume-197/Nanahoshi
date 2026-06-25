import { orgReadProcedure, requirePermission } from "../../index";
import {
	AddPathInput,
	CreateLibraryInputSchema,
	DeleteLibraryInput,
	GetLibraryByIdInput,
	RemovePathInput,
	ScanLibraryInput,
	UpdateLibraryInput,
} from "./library.model";
import * as service from "./library.service";

export const libraryRouter = {
	createLibrary: requirePermission("library", "create")
		.input(CreateLibraryInputSchema)
		.handler(async ({ input, context }) => {
			return await service.createLibrary(input, context.serverId);
		}),

	getLibraries: orgReadProcedure.handler(async ({ context }) => {
		return await service.getLibraries(
			context.serverId,
			context.accessibleLibraryIds,
		);
	}),

	getLibraryById: orgReadProcedure
		.input(GetLibraryByIdInput)
		.handler(async ({ input, context }) => {
			return await service.getLibraryById(
				input.id,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),

	addPath: requirePermission("library", "managePaths")
		.input(AddPathInput)
		.handler(async ({ input, context }) => {
			return await service.addPath(
				input.libraryId,
				input.path,
				context.serverId,
			);
		}),

	removePath: requirePermission("library", "managePaths")
		.input(RemovePathInput)
		.handler(async ({ input, context }) => {
			return await service.removePath(input.pathId, context.serverId);
		}),

	updateLibrary: requirePermission("library", "update")
		.input(UpdateLibraryInput)
		.handler(async ({ input, context }) => {
			const { id, ...data } = input;
			return await service.updateLibrary(id, data, context.serverId);
		}),

	deleteLibrary: requirePermission("library", "delete")
		.input(DeleteLibraryInput)
		.handler(async ({ input, context }) => {
			return await service.deleteLibrary(input.id, context.serverId);
		}),

	scanLibrary: requirePermission("library", "scan")
		.input(ScanLibraryInput)
		.handler(async ({ input, context }) => {
			return await service.scanLibrary(input.libraryId, context.serverId);
		}),
};
