import { adminProcedure } from "../../index";
import {
	ListSecurityAuditInput,
	RevokeSessionInput,
} from "./instance-activity.model";
import * as instanceActivityService from "./instance-activity.service";

export const instanceActivityRouter = {
	list: adminProcedure.input(ListSecurityAuditInput).handler(({ input }) =>
		instanceActivityService.listInstanceActivity({
			outcome: input?.outcome,
			userId: input?.userId,
			device: input?.device,
			serverId: input?.serverId,
			cursor: input?.cursor,
			limit: input?.limit ?? 50,
		}),
	),

	revokeSession: adminProcedure
		.input(RevokeSessionInput)
		.handler(({ input, context }) =>
			instanceActivityService.revokeSession({
				sessionId: input.sessionId,
				actor: {
					id: context.session.user.id,
					name: context.session.user.name,
				},
			}),
		),
};
