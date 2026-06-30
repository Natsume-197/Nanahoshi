import { protectedProcedure } from "../../index";
import {
	FollowInput,
	GetFollowersInput,
	GetFollowingInput,
	GetFriendsInput,
	GetSuggestionsInput,
	SetIdleInput,
	SetStatusInput,
} from "./follow.model";
import * as followService from "./follow.service";

export const followRouter = {
	follow: protectedProcedure
		.input(FollowInput)
		.handler(async ({ input, context }) => {
			await followService.followUser(context.session.user.id, input.username);
			return { success: true };
		}),

	unfollow: protectedProcedure
		.input(FollowInput)
		.handler(async ({ input, context }) => {
			await followService.unfollowUser(context.session.user.id, input.username);
			return { success: true };
		}),

	isFollowing: protectedProcedure
		.input(FollowInput)
		.handler(async ({ input, context }) => {
			return followService.isFollowing(context.session.user.id, input.username);
		}),

	getCounts: protectedProcedure
		.input(FollowInput)
		.handler(async ({ input }) => {
			return followService.getCounts(input.username);
		}),

	getFollowers: protectedProcedure
		.input(GetFollowersInput)
		.handler(async ({ input, context }) => {
			return followService.getFollowers(
				input.username,
				input.limit,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	getFollowing: protectedProcedure
		.input(GetFollowingInput)
		.handler(async ({ input, context }) => {
			return followService.getFollowing(
				input.username,
				input.limit,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	getSuggestions: protectedProcedure
		.input(GetSuggestionsInput)
		.handler(async ({ input, context }) => {
			const orgId = context.session.session.activeOrganizationId;
			if (!orgId) return [];
			return followService.getSuggestions(
				context.session.user.id,
				orgId,
				input.limit,
			);
		}),

	getFriendsWithPresence: protectedProcedure
		.input(GetFriendsInput)
		.handler(async ({ input, context }) => {
			const orgId = context.session.session.activeOrganizationId;
			if (!orgId) return [];
			return followService.getFriendsWithPresence(
				context.session.user.id,
				orgId,
				input.limit,
			);
		}),

	setStatus: protectedProcedure
		.input(SetStatusInput)
		.handler(async ({ input, context }) => {
			await followService.setStatus(context.session.user.id, input.status);
			return { success: true };
		}),

	clearActivity: protectedProcedure.handler(async ({ context }) => {
		await followService.clearActivity(context.session.user.id);
		return { success: true };
	}),

	setIdle: protectedProcedure
		.input(SetIdleInput)
		.handler(async ({ input, context }) => {
			await followService.setIdle(context.session.user.id, input.idle);
			return { success: true };
		}),
};
