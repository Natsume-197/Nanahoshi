import { resolveBookScope } from "../../auth/access.repository";
import { protectedProcedure } from "../../index";
import {
	GetProgressInput,
	ListInProgressInput,
	SaveProgressInput,
} from "./reading-progress.model";
import * as readingProgressService from "./reading-progress.service";

export const readingProgressRouter = {
	saveProgress: protectedProcedure
		.input(SaveProgressInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			const { serverId, scope } = await resolveBookScope(context.session);
			return readingProgressService.saveProgress(
				userId,
				input.bookUuid,
				serverId,
				scope,
				{
					exploredCharCount: input.exploredCharCount,
					bookCharCount: input.bookCharCount,
					readingTimeSeconds: input.readingTimeSeconds,
					status: input.status,
				},
			);
		}),

	getProgress: protectedProcedure
		.input(GetProgressInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			const { serverId, scope } = await resolveBookScope(context.session);
			return readingProgressService.getProgress(
				userId,
				input.bookUuid,
				serverId,
				scope,
			);
		}),

	listInProgress: protectedProcedure
		.input(ListInProgressInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			const { serverId, scope } = await resolveBookScope(context.session);
			return readingProgressService.listInProgress(
				userId,
				input?.limit ?? 20,
				serverId,
				scope,
			);
		}),
};
