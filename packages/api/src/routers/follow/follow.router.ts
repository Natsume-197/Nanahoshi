import { protectedProcedure } from "../../index";
import {
	FollowInput,
	GetFollowersInput,
	GetFollowingInput,
	GetSuggestionsInput,
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
};
