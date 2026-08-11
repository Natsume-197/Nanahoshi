import {
	canAccessBookAction,
	canAccessBookActionInOrganization,
} from "../../auth/access.repository";
import { hasGlobal } from "../../auth/access.service";
import { ForbiddenError, NotFoundError } from "../../errors";
import {
	orgReadProcedure,
	protectedProcedure,
	requirePermission,
} from "../../index";
import {
	GetAudioFileDownloadUrlInput,
	GetDirectoriesInput,
	GetReaderUrlInput,
	GetSeriesDownloadUrlInput,
	GetSignedDownloadUrlInput,
} from "./file.model";
import * as service from "./file.service";

export const fileRouter = {
	getReaderUrl: protectedProcedure
		.input(GetReaderUrlInput)
		.handler(async ({ input, context }) => {
			const allowed = await canAccessBookActionInOrganization(
				context.session,
				input.uuid,
				input.serverId,
				"book",
				"read",
			);
			if (!allowed) {
				throw new ForbiddenError("You cannot read this book");
			}
			const result = await service.getFileReader(input.uuid, input.serverId);
			if (!result) throw new NotFoundError("File not found");
			return result;
		}),

	// oRPC doesn't allow binary files to be transferred so in this case
	// we provide a short-lived signed URL for the binary download.
	getSignedDownloadUrl: protectedProcedure
		.input(GetSignedDownloadUrlInput)
		.handler(async ({ input, context }) => {
			const result = await service.getFileDownload(
				input.uuid,
				context.session.session.activeOrganizationId ?? undefined,
			);
			if (!result) throw new NotFoundError("File not found");
			// Audiobook downloads are gated by their own permission.
			const allowed = await canAccessBookAction(
				context.session,
				input.uuid,
				result.mediaType === "audiobook" ? "audiobook" : "book",
				"download",
			);
			if (!allowed) {
				throw new ForbiddenError("You cannot download this book");
			}
			return {
				url: result.url,
				filename: result.filename,
			};
		}),

	getAudioFileDownloadUrl: protectedProcedure
		.input(GetAudioFileDownloadUrlInput)
		.handler(async ({ input, context }) => {
			const allowed = await canAccessBookAction(
				context.session,
				input.uuid,
				"audiobook",
				"download",
			);
			if (!allowed) {
				throw new ForbiddenError("You cannot download this audiobook");
			}
			const result = await service.getAudioFileDownload(
				input.uuid,
				input.fileIndex,
				context.session.session.activeOrganizationId ?? undefined,
			);
			if (!result) throw new NotFoundError("Audio file not found");
			return result;
		}),

	getSeriesDownloadUrl: orgReadProcedure
		.input(GetSeriesDownloadUrlInput)
		.handler(async ({ input, context }) => {
			if (!hasGlobal(context.pc, "book", "download")) {
				throw new ForbiddenError("Missing permission: book:download");
			}
			const result = await service.getSeriesDownload(
				input.seriesUuid,
				context.serverId,
				context.accessibleLibraryIds,
			);
			if (!result) throw new NotFoundError("No downloadable files in series");
			return result;
		}),

	getDirectories: requirePermission("library", "managePaths")
		.input(GetDirectoriesInput)
		.handler(async ({ input }) => {
			return await service.getDirectories(input.location);
		}),
};
