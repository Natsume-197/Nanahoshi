import { resolveBookScope } from "../../auth/access.repository";
import { protectedProcedure } from "../../index";
import { ListShelfBucketInput } from "./shelves.model";
import * as shelvesService from "./shelves.service";

export const shelvesRouter = {
	summaries: protectedProcedure.handler(async ({ context }) => {
		const userId = context.session.user.id;
		const { serverId, scope } = await resolveBookScope(context.session);
		return shelvesService.getSummaries(userId, serverId, scope);
	}),

	list: protectedProcedure
		.input(ListShelfBucketInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			const { serverId, scope } = await resolveBookScope(context.session);
			return shelvesService.listBucket(
				userId,
				serverId,
				scope,
				input.status,
				input.limit,
				input.mediaType,
			);
		}),
};
