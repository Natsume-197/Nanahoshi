import { resolveBookScope } from "../../auth/access.repository";
import { orgProcedure, protectedProcedure } from "../../index";
import {
	ActivityInteractionInput,
	AddCommentInput,
	DeleteCommentInput,
	GetActivityFeedInput,
	GetCommentsInput,
	GetPublicActivityFeedInput,
	GetPublicProfileInput,
	GetSocialFeedInput,
	UpdateOrgProfileInput,
	UpdateProfileInput,
} from "./profile.model";
import * as profileService from "./profile.service";

export const profileRouter = {
	getProfile: protectedProcedure.handler(async ({ context }) => {
		return profileService.getProfile(
			context.session.user.id,
			context.session.session.activeOrganizationId ?? undefined,
		);
	}),

	getStats: protectedProcedure.handler(async ({ context }) => {
		const { serverId, scope } = await resolveBookScope(context.session);
		return profileService.getStats(context.session.user.id, serverId, scope);
	}),

	getActivityFeed: protectedProcedure
		.input(GetActivityFeedInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return profileService.getActivityFeed(
				context.session.user.id,
				input?.limit ?? 20,
				serverId,
				scope,
			);
		}),

	getActivityCalendar: protectedProcedure.handler(async ({ context }) => {
		const { serverId, scope } = await resolveBookScope(context.session);
		return profileService.getActivityCalendar(
			context.session.user.id,
			serverId,
			scope,
		);
	}),

	getPublicActivityCalendar: protectedProcedure
		.input(GetPublicProfileInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return profileService.getActivityCalendarByUsername(
				input.username,
				serverId,
				scope,
			);
		}),

	updateProfile: protectedProcedure
		.input(UpdateProfileInput)
		.handler(async ({ input, context }) => {
			return profileService.updateProfile(context.session.user.id, {
				name: input.name,
				bio: input.bio,
				headerImage: input.headerImage,
			});
		}),

	// Per-community profile override (bio/banner/avatar for the active org)
	updateOrgProfile: orgProcedure
		.input(UpdateOrgProfileInput)
		.handler(async ({ input, context }) => {
			return profileService.updateOrgProfile(
				context.session.user.id,
				context.serverId,
				{
					bio: input.bio,
					headerImage: input.headerImage,
					image: input.image,
				},
			);
		}),

	// Public profile endpoints (by username)
	getPublicProfile: protectedProcedure
		.input(GetPublicProfileInput)
		.handler(async ({ input, context }) => {
			return profileService.getProfileByUsername(
				input.username,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	getPublicStats: protectedProcedure
		.input(GetPublicProfileInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return profileService.getStatsByUsername(input.username, serverId, scope);
		}),

	getPublicActivityFeed: protectedProcedure
		.input(GetPublicActivityFeedInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return profileService.getActivityFeedByUsername(
				input.username,
				context.session.user.id,
				input.limit,
				serverId,
				scope,
			);
		}),

	// Social feed
	getSocialFeed: protectedProcedure
		.input(GetSocialFeedInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			return profileService.getSocialFeed(
				context.session.user.id,
				serverId,
				input.type,
				input.limit,
				input.cursor,
				scope,
			);
		}),

	// Activity interactions
	likeActivity: protectedProcedure
		.input(ActivityInteractionInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			await profileService.likeActivity(
				context.session.user.id,
				input.activityId,
				serverId,
				scope,
			);
			return { success: true };
		}),

	unlikeActivity: protectedProcedure
		.input(ActivityInteractionInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			await profileService.unlikeActivity(
				context.session.user.id,
				input.activityId,
				serverId,
				scope,
			);
			return { success: true };
		}),

	addComment: protectedProcedure
		.input(AddCommentInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return profileService.addComment(
				context.session.user.id,
				input.activityId,
				input.content,
				serverId,
				scope,
			);
		}),

	deleteComment: protectedProcedure
		.input(DeleteCommentInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			await profileService.deleteComment(
				input.commentId,
				context.session.user.id,
				serverId,
				scope,
			);
			return { success: true };
		}),

	getComments: protectedProcedure
		.input(GetCommentsInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return profileService.getComments(
				input.activityId,
				input.limit,
				serverId,
				scope,
			);
		}),
};
