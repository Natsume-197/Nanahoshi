import { protectedProcedure } from "../../index";
import {
	GetListeningProgressInput,
	ListListeningInput,
	SaveListeningProgressInput,
} from "./listening-progress.model";
import * as listeningProgressService from "./listening-progress.service";

export const listeningProgressRouter = {
	saveProgress: protectedProcedure
		.input(SaveListeningProgressInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			return listeningProgressService.saveProgress(
				userId,
				input.bookUuid,
				context.session.session.activeOrganizationId ?? undefined,
				{
					currentTimeSeconds: input.currentTimeSeconds,
					durationSeconds: input.durationSeconds,
					listeningTimeSeconds: input.listeningTimeSeconds,
					status: input.status,
				},
			);
		}),

	getProgress: protectedProcedure
		.input(GetListeningProgressInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			return listeningProgressService.getProgress(
				userId,
				input.bookUuid,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	listInProgress: protectedProcedure
		.input(ListListeningInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			return listeningProgressService.listInProgress(
				userId,
				input?.limit ?? 20,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),
};
