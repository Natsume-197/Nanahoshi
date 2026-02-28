import { protectedProcedure } from "../../index";
import {
	GetActivityFeedInput,
	UpdateProfileInput,
} from "./profile.model";
import * as profileService from "./profile.service";

export const profileRouter = {
	getProfile: protectedProcedure.handler(async ({ context }) => {
		return profileService.getProfile(context.session.user.id);
	}),

	getStats: protectedProcedure.handler(async ({ context }) => {
		return profileService.getStats(context.session.user.id);
	}),

	getActivityFeed: protectedProcedure
		.input(GetActivityFeedInput)
		.handler(async ({ input, context }) => {
			return profileService.getActivityFeed(
				context.session.user.id,
				input?.limit ?? 20,
			);
		}),

	updateProfile: protectedProcedure
		.input(UpdateProfileInput)
		.handler(async ({ input, context }) => {
			return profileService.updateProfile(context.session.user.id, {
				bio: input.bio,
			});
		}),
};
