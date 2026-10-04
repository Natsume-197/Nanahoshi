import { resolveBookScope } from "../../auth/access.repository";
import { protectedProcedure } from "../../index";
import {
	GetPublicProfileInput,
	UpdatePrivacyInput,
	UpdateProfileInput,
} from "./profile.model";
import * as profileService from "./profile.service";

export const profileRouter = {
	getProfile: protectedProcedure.handler(async ({ context }) => {
		return profileService.getProfile(context.session.user.id);
	}),

	getStats: protectedProcedure.handler(async ({ context }) => {
		const { serverId, scope } = await resolveBookScope(context.session);
		return profileService.getStats(context.session.user.id, serverId, scope);
	}),

	updateProfile: protectedProcedure
		.input(UpdateProfileInput)
		.handler(async ({ input, context }) => {
			return profileService.updateProfile(context.session.user.id, {
				name: input.name,
				headerImage: input.headerImage,
			});
		}),

	getPrivacy: protectedProcedure.handler(({ context }) =>
		profileService.getPrivacy(context.session.user.id),
	),

	updatePrivacy: protectedProcedure
		.input(UpdatePrivacyInput)
		.handler(({ input, context }) =>
			profileService.updatePrivacy(context.session.user.id, input),
		),

	// Public profile endpoints (by username)
	getPublicProfile: protectedProcedure
		.input(GetPublicProfileInput)
		.handler(async ({ input, context }) => {
			return profileService.getProfileByUsername(
				input.username,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),
};
