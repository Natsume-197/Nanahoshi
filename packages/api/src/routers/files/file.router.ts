import { z } from "zod";
import { canAccessBookAction } from "../../auth/access.repository";
import { ForbiddenError, NotFoundError } from "../../errors";
import { protectedProcedure, requirePermission } from "../../index";
import * as service from "./file.service";

export const fileRouter = {
	// oRPC doesn't allow binary files to be transferred so in this case
	// I'll be providing a signed URL that allows the file download just one time
	// This link will be valid just for a short amount of time
	getSignedDownloadUrl: protectedProcedure
		.input(z.object({ uuid: z.string() }))
		.handler(async ({ input, context }) => {
			const allowed = await canAccessBookAction(
				context.session,
				input.uuid,
				"book",
				"download",
			);
			if (!allowed) {
				throw new ForbiddenError("You cannot download this book");
			}
			const result = await service.getFileDownload(
				input.uuid,
				context.session.session.activeOrganizationId ?? undefined,
			);
			if (!result) throw new NotFoundError("File not found");
			return {
				url: result.url,
				filename: result.file.filename,
			};
		}),

	getSeriesDownloadUrl: protectedProcedure
		.input(z.object({ seriesName: z.string().min(1) }))
		.handler(async ({ input, context }) => {
			const result = await service.getSeriesDownload(
				input.seriesName,
				context.session.session.activeOrganizationId ?? undefined,
			);
			if (!result) throw new NotFoundError("No downloadable files in series");
			return result;
		}),

	getDirectories: requirePermission("library", "managePaths")
		.input(z.object({ location: z.string() }))
		.handler(async ({ input }) => {
			return await service.getDirectories(input.location);
		}),
};
