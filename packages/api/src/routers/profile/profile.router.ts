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

	getActivityCalendar: protectedProcedure.handler(async ({ context }) => {
		return profileService.getActivityCalendar(
			context.session.user.id,
			context.session.session.activeOrganizationId ?? undefined,
		);
	}),

	getPublicActivityCalendar: protectedProcedure
		.input(GetPublicProfileInput)
		.handler(async ({ input, context }) => {
			return profileService.getActivityCalendarByUsername(
				input.username,
				context.session.session.activeOrganizationId ?? undefined,
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
				context.organizationId,
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
			return profileService.getStatsByUsername(
				input.username,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	getPublicActivityFeed: protectedProcedure
		.input(GetPublicActivityFeedInput)
		.handler(async ({ input, context }) => {
			return profileService.getActivityFeedByUsername(
				input.username,
				context.session.user.id,
				input.limit,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	// Social feed
	getSocialFeed: protectedProcedure
		.input(GetSocialFeedInput)
		.handler(async ({ input, context }) => {
			const orgId = context.session.session.activeOrganizationId;
			if (!orgId) return [];
			return profileService.getSocialFeed(
				context.session.user.id,
				orgId,
				input.type,
				input.limit,
				input.cursor,
			);
		}),

	// Activity interactions
	likeActivity: protectedProcedure
		.input(ActivityInteractionInput)
		.handler(async ({ input, context }) => {
			await profileService.likeActivity(
				context.session.user.id,
				input.activityId,
			);
			return { success: true };
		}),

	unlikeActivity: protectedProcedure
		.input(ActivityInteractionInput)
		.handler(async ({ input, context }) => {
			await profileService.unlikeActivity(
				context.session.user.id,
				input.activityId,
			);
			return { success: true };
		}),

	addComment: protectedProcedure
		.input(AddCommentInput)
		.handler(async ({ input, context }) => {
			return profileService.addComment(
				context.session.user.id,
				input.activityId,
				input.content,
			);
		}),

	deleteComment: protectedProcedure
		.input(DeleteCommentInput)
		.handler(async ({ input, context }) => {
			await profileService.deleteComment(
				input.commentId,
				context.session.user.id,
			);
			return { success: true };
		}),

	getComments: protectedProcedure
		.input(GetCommentsInput)
		.handler(async ({ input, context }) => {
			return profileService.getComments(
				input.activityId,
				input.limit,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),
};
