import { resolveBookScope } from "../../auth/access.repository";
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
			const { serverId, scope } = await resolveBookScope(context.session);
			return listeningProgressService.saveProgress(
				userId,
				input.bookUuid,
				serverId,
				scope,
				{
					currentTimeSeconds: input.currentTimeSeconds,
					durationSeconds: input.durationSeconds,
					listeningTimeSeconds: input.listeningTimeSeconds,
					status: input.status,
				},
				{
					sessionId: context.session.session.id,
					userName: context.session.user.name,
					userImage: context.session.user.image ?? null,
					device: context.session.session.userAgent ?? null,
					ipAddress: context.session.session.ipAddress ?? null,
				},
			);
		}),

	getProgress: protectedProcedure
		.input(GetListeningProgressInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			const { serverId, scope } = await resolveBookScope(context.session);
			return listeningProgressService.getProgress(
				userId,
				input.bookUuid,
				serverId,
				scope,
			);
		}),

	listInProgress: protectedProcedure
		.input(ListListeningInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			const { serverId, scope } = await resolveBookScope(context.session);
			return listeningProgressService.listInProgress(
				userId,
				input?.limit ?? 20,
				serverId,
				scope,
			);
		}),
};
