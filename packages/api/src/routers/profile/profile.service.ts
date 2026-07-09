import { NotFoundError } from "../../errors";
import { logger } from "../../lib/logger";
import type { LibraryScope } from "../_shared/library-scope";
import { membersRepository } from "../members/members.repository";
import * as notificationService from "../notifications/notification.service";
import { activityRepository, profileRepository } from "./profile.repository";

const log = logger.child({ component: "profile" });

export const getProfile = async (userId: string, serverId?: string) => {
	return profileRepository.getProfile(userId, serverId);
};

// Resolve a profile by username, scoped to the viewer's org. In the isolated-
// communities model you only see co-members, so a non-member is "not found"
// (don't reveal the account exists).
export const getProfileByUsername = async (
	username: string,
	serverId?: string,
) => {
	// Fail closed: without an active org there are no co-members to reveal, so
	// don't leak that the account exists platform-wide.
	if (!serverId) throw new NotFoundError("User not found");
	const profile = await profileRepository.getProfileByUsername(
		username,
		serverId,
	);
	if (!profile) throw new NotFoundError("User not found");
	if (!(await membersRepository.isMember(profile.id, serverId))) {
		throw new NotFoundError("User not found");
	}
	return profile;
};

export const getStats = async (
	userId: string,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	if (!serverId) {
		return {
			booksStarted: 0,
			booksCompleted: 0,
			totalReadingTimeSeconds: 0,
			totalCharsRead: 0,
		};
	}

	return profileRepository.getStats(userId, serverId, scope);
};

export const getStatsByUsername = async (
	username: string,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	const profile = await getProfileByUsername(username, serverId);
	return getStats(profile.id, serverId, scope);
};

export const getActivityCalendar = async (
	userId: string,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	return profileRepository.getActivityCalendar(userId, serverId, scope);
};

export const getActivityCalendarByUsername = async (
	username: string,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	const profile = await getProfileByUsername(username, serverId);
	return profileRepository.getActivityCalendar(profile.id, serverId, scope);
};

export const getActivityFeed = async (
	userId: string,
	limit = 20,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	const items = await activityRepository.getUserFeed(
		userId,
		limit,
		serverId,
		scope,
	);

	const activityIds = items.map((item) => item.id);
	const likedIds = await activityRepository.getLikedActivityIds(
		userId,
		activityIds,
	);
	const likedSet = new Set(likedIds.map((id) => Number(id)));

	return items.map((item) => ({
		...item,
		isLiked: likedSet.has(Number(item.id)),
	}));
};

export const getActivityFeedByUsername = async (
	username: string,
	viewerId: string,
	limit = 20,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	const profile = await getProfileByUsername(username, serverId);

	const items = await activityRepository.getUserFeed(
		profile.id,
		limit,
		serverId,
		scope,
	);

	const activityIds = items.map((item) => item.id);
	const likedIds = await activityRepository.getLikedActivityIds(
		viewerId,
		activityIds,
	);
	const likedSet = new Set(likedIds.map((id) => Number(id)));

	return items.map((item) => ({
		...item,
		isLiked: likedSet.has(Number(item.id)),
	}));
};

export const updateProfile = async (
	userId: string,
	data: { name?: string; bio?: string; headerImage?: string },
) => {
	await profileRepository.updateProfile(userId, data);
	return profileRepository.getProfile(userId);
};

/** Update the per-community profile override (bio/banner/avatar) for the org. */
export const updateOrgProfile = async (
	userId: string,
	serverId: string,
	data: {
		bio?: string | null;
		headerImage?: string | null;
		image?: string | null;
	},
) => {
	await profileRepository.updateOrgProfile(userId, serverId, data);
	return profileRepository.getProfile(userId, serverId);
};

// Social feed
export const getSocialFeed = async (
	userId: string,
	serverId: string,
	type: "global" | "following",
	limit = 20,
	cursor?: number,
	scope: LibraryScope = "ALL",
) => {
	const items =
		type === "global"
			? await activityRepository.getGlobalFeed(serverId, limit, cursor, scope)
			: await activityRepository.getFollowingFeed(
					userId,
					serverId,
					limit,
					cursor,
					scope,
				);

	const activityIds = items.map((item) => item.id);
	const likedIds = await activityRepository.getLikedActivityIds(
		userId,
		activityIds,
	);
	const likedSet = new Set(likedIds.map((id) => Number(id)));

	return items.map((item) => ({
		...item,
		isLiked: likedSet.has(Number(item.id)),
	}));
};

// Activity interactions
async function ensureActivityAccessible(
	activityId: number,
	serverId?: string,
	scope: LibraryScope = "ALL",
) {
	if (
		!serverId ||
		!(await activityRepository.isActivityAccessible(
			activityId,
			serverId,
			scope,
		))
	) {
		throw new NotFoundError("Activity not found");
	}
}

export const likeActivity = async (
	userId: string,
	activityId: number,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	await ensureActivityAccessible(activityId, serverId, scope);
	const inserted = await activityRepository.likeActivity(userId, activityId);
	if (inserted) {
		notificationService
			.emitActivityLike({ actorId: userId, activityId })
			.catch((err) => log.error({ err, activityId }, "like notify failed"));
	}
};

export const unlikeActivity = async (
	userId: string,
	activityId: number,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	await ensureActivityAccessible(activityId, serverId, scope);
	await activityRepository.unlikeActivity(userId, activityId);
	notificationService
		.retractActivityLike({ actorId: userId, activityId })
		.catch((err) => log.error({ err, activityId }, "like retract failed"));
};

export const addComment = async (
	userId: string,
	activityId: number,
	content: string,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	await ensureActivityAccessible(activityId, serverId, scope);
	const comment = await activityRepository.addComment(
		userId,
		activityId,
		content,
	);
	if (comment) {
		notificationService
			.emitActivityComment({
				actorId: userId,
				activityId,
				commentId: comment.id,
				content: comment.content,
			})
			.catch((err) => log.error({ err, activityId }, "comment notify failed"));
	}
	return comment;
};

export const deleteComment = async (
	commentId: number,
	userId: string,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	if (
		!serverId ||
		!(await activityRepository.isCommentAccessible(
			commentId,
			userId,
			serverId,
			scope,
		))
	) {
		throw new NotFoundError("Comment not found");
	}
	const deleted = await activityRepository.deleteComment(commentId, userId);
	if (deleted) {
		notificationService
			.retractComment(commentId)
			.catch((err) => log.error({ err, commentId }, "comment retract failed"));
	}
};

export const getComments = async (
	activityId: number,
	limit = 20,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	return activityRepository.getComments(activityId, limit, serverId, scope);
};
