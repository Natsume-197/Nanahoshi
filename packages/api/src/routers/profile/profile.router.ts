import { protectedProcedure } from "../../index";
import { GetActivityFeedInput, UpdateProfileInput } from "./profile.model";
import * as profileService from "./profile.service";

export const profileRouter = {
	getProfile: protectedProcedure.handler(async ({ context }) => {
		return profileService.getProfile(context.session.user.id);
	}),

	getStats: protectedProcedure.handler(async ({ context }) => {
		return profileService.getStats(
			context.session.user.id,
			context.session.session.activeOrganizationId ?? undefined,
		);
	}),

	getActivityFeed: protectedProcedure
		.input(GetActivityFeedInput)
		.handler(async ({ input, context }) => {
			return profileService.getActivityFeed(
				context.session.user.id,
				input?.limit ?? 20,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	updateProfile: protectedProcedure
		.input(UpdateProfileInput)
		.handler(async ({ input, context }) => {
			return profileService.updateProfile(context.session.user.id, {
				name: input.name,
				bio: input.bio,
			});
		}),
};
