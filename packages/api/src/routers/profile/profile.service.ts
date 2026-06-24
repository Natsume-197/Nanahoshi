import { NotFoundError } from "../../errors";
import { membersRepository } from "../members/members.repository";
import { activityRepository, profileRepository } from "./profile.repository";

export const getProfile = async (userId: string, organizationId?: string) => {
	return profileRepository.getProfile(userId, organizationId);
};

/**
 * Resolve a profile by username, scoped to the viewer's active org. In the
 * isolated-communities model you can only see profiles of co-members, so a
 * non-member is treated as not found (don't reveal the account exists).
 */
export const getProfileByUsername = async (
	username: string,
	organizationId?: string,
) => {
	const profile = await profileRepository.getProfileByUsername(
		username,
		organizationId,
	);
	if (!profile) throw new NotFoundError("User not found");
	if (
		organizationId &&
		!(await membersRepository.isMember(profile.id, organizationId))
	) {
		throw new NotFoundError("User not found");
	}
	return profile;
};

export const getStats = async (userId: string, organizationId?: string) => {
	if (!organizationId) {
		return {
			booksStarted: 0,
			booksCompleted: 0,
			totalReadingTimeSeconds: 0,
			totalCharsRead: 0,
		};
	}

	return profileRepository.getStats(userId, organizationId);
};

export const getStatsByUsername = async (
	username: string,
	organizationId?: string,
) => {
	const profile = await getProfileByUsername(username, organizationId);
	return getStats(profile.id, organizationId);
};

export const getActivityCalendar = async (
	userId: string,
	organizationId?: string,
) => {
	return profileRepository.getActivityCalendar(userId, organizationId);
};

export const getActivityCalendarByUsername = async (
	username: string,
	organizationId?: string,
) => {
	const profile = await getProfileByUsername(username, organizationId);
	return profileRepository.getActivityCalendar(profile.id, organizationId);
};

export const getActivityFeed = async (
	userId: string,
	limit = 20,
	organizationId?: string,
) => {
	const items = await activityRepository.getUserFeed(
		userId,
		limit,
		organizationId,
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
	organizationId?: string,
) => {
	const profile = await getProfileByUsername(username, organizationId);

	const items = await activityRepository.getUserFeed(
		profile.id,
		limit,
		organizationId,
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
	organizationId: string,
	data: {
		bio?: string | null;
		headerImage?: string | null;
		image?: string | null;
	},
) => {
	await profileRepository.updateOrgProfile(userId, organizationId, data);
	return profileRepository.getProfile(userId, organizationId);
};

// Social feed
export const getSocialFeed = async (
	userId: string,
	organizationId: string,
	type: "global" | "following",
	limit = 20,
	cursor?: number,
) => {
	const items =
		type === "global"
			? await activityRepository.getGlobalFeed(organizationId, limit, cursor)
			: await activityRepository.getFollowingFeed(
					userId,
					organizationId,
					limit,
					cursor,
				);

	// Get which activities the current user has liked
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
export const likeActivity = async (userId: string, activityId: number) => {
	await activityRepository.likeActivity(userId, activityId);
};

export const unlikeActivity = async (userId: string, activityId: number) => {
	await activityRepository.unlikeActivity(userId, activityId);
};

export const addComment = async (
	userId: string,
	activityId: number,
	content: string,
) => {
	return activityRepository.addComment(userId, activityId, content);
};

export const deleteComment = async (commentId: number, userId: string) => {
	await activityRepository.deleteComment(commentId, userId);
};

export const getComments = async (
	activityId: number,
	limit = 20,
	organizationId?: string,
) => {
	return activityRepository.getComments(activityId, limit, organizationId);
};
