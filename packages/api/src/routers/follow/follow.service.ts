import {
	type PresenceState,
	STATE_WEIGHT,
} from "../../modules/presence/presence.types";
import * as presence from "../../modules/presence/presenceManager";
import { followRepository } from "./follow.repository";

// A follow/unfollow only changes the friends graph when it creates or breaks a
// *mutual* follow. In that case both users gained/lost a friend, so push a
// friends-changed signal to each — their panels and live routing update at once.
function notifyMutualChange(a: string, b: string) {
	presence.notifyFriendsChanged(a);
	presence.notifyFriendsChanged(b);
}

export const followUser = async (
	followerId: string,
	targetUsername: string,
) => {
	const targetId = await followRepository.getUserIdByUsername(targetUsername);
	if (!targetId) throw new Error("User not found");
	if (followerId === targetId) throw new Error("Cannot follow yourself");
	// The reverse edge (target→follower) is untouched by our write, so check it
	// concurrently with the follow to learn if this completed a mutual follow.
	const [, followedBack] = await Promise.all([
		followRepository.follow(followerId, targetId),
		followRepository.isFollowing(targetId, followerId),
	]);
	if (followedBack) notifyMutualChange(followerId, targetId);
};

export const unfollowUser = async (
	followerId: string,
	targetUsername: string,
) => {
	const targetId = await followRepository.getUserIdByUsername(targetUsername);
	if (!targetId) throw new Error("User not found");
	// The reverse edge is untouched by our delete, so check it concurrently: if
	// they followed back, this unfollow breaks an existing friendship.
	const [wasMutual] = await Promise.all([
		followRepository.isFollowing(targetId, followerId),
		followRepository.unfollow(followerId, targetId),
	]);
	if (wasMutual) notifyMutualChange(followerId, targetId);
};

export const isFollowing = async (
	followerId: string,
	targetUsername: string,
) => {
	const targetId = await followRepository.getUserIdByUsername(targetUsername);
	if (!targetId) return false;
	return followRepository.isFollowing(followerId, targetId);
};

export const getCounts = async (username: string) => {
	const userId = await followRepository.getUserIdByUsername(username);
	if (!userId) throw new Error("User not found");
	return followRepository.getCounts(userId);
};

export const getFollowers = async (
	username: string,
	limit = 20,
	serverId?: string,
) => {
	const userId = await followRepository.getUserIdByUsername(username);
	if (!userId) throw new Error("User not found");
	return followRepository.getFollowers(userId, limit, serverId);
};

export const getFollowing = async (
	username: string,
	limit = 20,
	serverId?: string,
) => {
	const userId = await followRepository.getUserIdByUsername(username);
	if (!userId) throw new Error("User not found");
	return followRepository.getFollowing(userId, limit, serverId);
};

export const getSuggestions = async (
	userId: string,
	serverId: string,
	limit = 5,
) => {
	return followRepository.getSuggestions(userId, serverId, limit);
};

export const getFriendsWithPresence = async (
	userId: string,
	serverId: string,
	limit = 50,
) => {
	const friends = await followRepository.getFriends(userId, serverId, limit);
	const presenceMap = await presence.getPresenceFor(friends.map((f) => f.id));
	return friends
		.map((friend) => {
			const p = presenceMap.get(friend.id);
			return {
				...friend,
				state: p?.state ?? ("offline" as PresenceState),
				book: p?.book ?? null,
			};
		})
		.sort((a, b) => STATE_WEIGHT[a.state] - STATE_WEIGHT[b.state]);
};

export const setStatus = async (
	userId: string,
	status: presence.ManualPresenceStatus,
) => {
	await followRepository.setStatus(userId, status);
	await presence.setManualStatus(userId, status);
};

export const clearActivity = async (userId: string) => {
	await presence.clearActivity(userId);
};

export const setIdle = async (userId: string, idle: boolean) => {
	await presence.setIdle(userId, idle);
};
