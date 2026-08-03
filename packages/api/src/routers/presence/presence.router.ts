import { protectedProcedure } from "../../index";
import { SetIdleInput, SetStatusInput } from "./presence.model";
import * as presenceService from "./presence.service";

export const presenceRouter = {
	setStatus: protectedProcedure
		.input(SetStatusInput)
		.handler(async ({ input, context }) => {
			await presenceService.setStatus(context.session.user.id, input.status);
			return { success: true };
		}),

	clearActivity: protectedProcedure.handler(async ({ context }) => {
		await presenceService.clearActivity(context.session.user.id);
		return { success: true };
	}),

	setIdle: protectedProcedure
		.input(SetIdleInput)
		.handler(async ({ input, context }) => {
			await presenceService.setIdle(context.session.user.id, input.idle);
			return { success: true };
		}),
};
