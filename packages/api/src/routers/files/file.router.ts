import { z } from "zod";
import { NotFoundError } from "../../errors";
import { protectedProcedure } from "../../index";
import * as service from "./file.service";

export const fileRouter = {
	// oRPC doesn't allow binary files to be transferred so in this case
	// I'll be providing a signed URL that allows the file download just one time
	// This link will be valid just for a short amount of time
	getSignedDownloadUrl: protectedProcedure
		.input(z.object({ uuid: z.string() }))
		.handler(async ({ input, context }) => {
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

	getDirectories: protectedProcedure
		.input(z.object({ location: z.string() }))
		.handler(async ({ input }) => {
			return await service.getDirectories(input.location);
		}),
};
