import { followRepository } from "./follow.repository";

export const followUser = async (followerId: string, targetUsername: string) => {
	const targetId = await followRepository.getUserIdByUsername(targetUsername);
	if (!targetId) throw new Error("User not found");
	if (followerId === targetId) throw new Error("Cannot follow yourself");
	await followRepository.follow(followerId, targetId);
};

export const unfollowUser = async (followerId: string, targetUsername: string) => {
	const targetId = await followRepository.getUserIdByUsername(targetUsername);
	if (!targetId) throw new Error("User not found");
	await followRepository.unfollow(followerId, targetId);
};

export const isFollowing = async (followerId: string, targetUsername: string) => {
	const targetId = await followRepository.getUserIdByUsername(targetUsername);
	if (!targetId) return false;
	return followRepository.isFollowing(followerId, targetId);
};

export const getCounts = async (username: string) => {
	const userId = await followRepository.getUserIdByUsername(username);
	if (!userId) throw new Error("User not found");
	return followRepository.getCounts(userId);
};

export const getFollowers = async (username: string, limit = 20) => {
	const userId = await followRepository.getUserIdByUsername(username);
	if (!userId) throw new Error("User not found");
	return followRepository.getFollowers(userId, limit);
};

export const getFollowing = async (username: string, limit = 20) => {
	const userId = await followRepository.getUserIdByUsername(username);
	if (!userId) throw new Error("User not found");
	return followRepository.getFollowing(userId, limit);
};
