import { z } from "zod";
import { orgReadProcedure, requirePermission } from "../../index";
import * as service from "./library.service";

export const libraryRouter = {
	createLibrary: requirePermission("library", "create")
		.input(
			z.object({
				name: z.string().min(1, "Library name is required"),
				isCronWatch: z.boolean().default(false),
				isPublic: z.boolean().default(false),
				mediaType: z.enum(["ebook", "audiobook"]).default("ebook"),
				metadataProviders: z
					.array(z.enum(["ranobedb", "amazon"]))
					.default(["ranobedb", "amazon"]),
				paths: z.array(z.string()).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			return await service.createLibrary(input, context.organizationId);
		}),

	getLibraries: orgReadProcedure.handler(async ({ context }) => {
		return await service.getLibraries(
			context.organizationId,
			context.accessibleLibraryIds,
		);
	}),

	getLibraryById: orgReadProcedure
		.input(
			z.object({
				id: z.number().int().nonnegative(),
			}),
		)
		.handler(async ({ input, context }) => {
			return await service.getLibraryById(
				input.id,
				context.organizationId,
				context.accessibleLibraryIds,
			);
		}),

	addPath: requirePermission("library", "managePaths")
		.input(
			z.object({
				libraryId: z.number().int().nonnegative(),
				path: z.string().min(1),
			}),
		)
		.handler(async ({ input, context }) => {
			return await service.addPath(
				input.libraryId,
				input.path,
				context.organizationId,
			);
		}),

	removePath: requirePermission("library", "managePaths")
		.input(
			z.object({
				pathId: z.number().int().nonnegative(),
			}),
		)
		.handler(async ({ input, context }) => {
			return await service.removePath(input.pathId, context.organizationId);
		}),

	updateLibrary: requirePermission("library", "update")
		.input(
			z.object({
				id: z.number().int().nonnegative(),
				name: z.string().min(1).optional(),
				isCronWatch: z.boolean().optional(),
				isPublic: z.boolean().optional(),
				metadataProviders: z.array(z.enum(["ranobedb", "amazon"])).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			const { id, ...data } = input;
			return await service.updateLibrary(id, data, context.organizationId);
		}),

	deleteLibrary: requirePermission("library", "delete")
		.input(
			z.object({
				id: z.number().int().nonnegative(),
			}),
		)
		.handler(async ({ input, context }) => {
			return await service.deleteLibrary(input.id, context.organizationId);
		}),

	scanLibrary: requirePermission("library", "scan")
		.input(
			z.object({
				libraryId: z.number().int().nonnegative(),
			}),
		)
		.handler(async ({ input, context }) => {
			return await service.scanLibrary(input.libraryId, context.organizationId);
		}),
};
