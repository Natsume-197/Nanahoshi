import { canAccessBookAction } from "../../auth/access.repository";
import { ForbiddenError, NotFoundError } from "../../errors";
import { orgReadProcedure, protectedProcedure } from "../../index";
import { clearActivePlayback } from "../../modules/instance-activity/playback.manager";
import { readListenService } from "../read-listen/read-listen.service";
import {
	MarkReadListenActivityInput,
	SetIdleInput,
	SetStatusInput,
} from "./presence.model";
import * as presenceService from "./presence.service";

export const presenceRouter = {
	setStatus: protectedProcedure
		.input(SetStatusInput)
		.handler(async ({ input, context }) => {
			await presenceService.setStatus(context.session.user.id, input.status);
			return { success: true };
		}),

	clearActivity: protectedProcedure.handler(async ({ context }) => {
		await Promise.all([
			presenceService.clearActivity(
				context.session.user.id,
				context.session.session.id,
			),
			clearActivePlayback(context.session.session.id).catch(() => {}),
		]);
		return { success: true };
	}),

	setIdle: protectedProcedure
		.input(SetIdleInput)
		.handler(async ({ input, context }) => {
			await presenceService.setIdle(context.session.user.id, input.idle);
			return { success: true };
		}),

	markReadListenActivity: orgReadProcedure
		.input(MarkReadListenActivityInput)
		.handler(async ({ input, context }) => {
			const pair = await readListenService.getPairForManagement(
				input.pairUuid,
				context.serverId,
				context.accessibleLibraryIds,
			);
			if (pair.ebook.uuid !== input.ebookUuid) {
				throw new NotFoundError("Read & Listen pair not found for this ebook");
			}
			const readable = await Promise.all(
				[pair.ebook.uuid, pair.audiobook.uuid].map((uuid) =>
					canAccessBookAction(context.session, uuid, "book", "read"),
				),
			);
			if (!readable.every(Boolean)) {
				throw new ForbiddenError(
					"You cannot read one of these Read & Listen publications",
				);
			}
			await presenceService.markReadListenActivity(
				context.session.user.id,
				context.session.session.id,
				{
					uuid: pair.ebook.uuid,
					title: pair.ebook.title,
					cover: pair.ebook.cover,
					pairUuid: pair.id,
					audiobook: {
						uuid: pair.audiobook.uuid,
						title: pair.audiobook.title,
						cover: pair.audiobook.cover,
					},
				},
			);
			return { success: true };
		}),
};
