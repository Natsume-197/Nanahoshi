import { z } from "zod";
import { protectedProcedure } from "../../index";
import * as service from "./file.service";

export const fileRouter = {
	// oRPC doesn't allow binary files to be transferred so in this case
	// I'll be providing a signed URL that allows the file download just one time
	// This link will be valid just for a short amount of time
	getSignedDownloadUrl: protectedProcedure
		.input(z.object({ uuid: z.string() }))
		.handler(async ({ input }) => {
			const result = await service.getFileDownload(input.uuid);
			if (!result) throw new Error("Not found");
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
