import { z } from "zod";
import { protectedProcedure } from "../../index";
import * as service from "./library.service";

export const libraryRouter = {
	createLibrary: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1, "Library name is required"),
				isCronWatch: z.boolean().default(false),
				isPublic: z.boolean().default(false),
				paths: z.array(z.string()).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			return await service.createLibrary(
				input,
				context.session.session.activeOrganizationId,
			);
		}),

	getLibraries: protectedProcedure.handler(async () => {
		return await service.getLibraries();
	}),

	getLibraryById: protectedProcedure
		.input(
			z.object({
				id: z.number().int().nonnegative(),
			}),
		)
		.handler(async ({ input }) => {
			return await service.getLibraryById(input.id);
		}),

	addPath: protectedProcedure
		.input(
			z.object({
				libraryId: z.number().int().nonnegative(),
				path: z.string().min(1),
			}),
		)
		.handler(async ({ input }) => {
			return await service.addPath(input.libraryId, input.path);
		}),

	removePath: protectedProcedure
		.input(
			z.object({
				pathId: z.number().int().nonnegative(),
			}),
		)
		.handler(async ({ input }) => {
			return await service.removePath(input.pathId);
		}),

	scanLibrary: protectedProcedure
		.input(
			z.object({
				libraryId: z.number().int().nonnegative(),
			}),
		)
		.handler(async ({ input }) => {
			return await service.scanLibrary(input.libraryId);
		}),
};
