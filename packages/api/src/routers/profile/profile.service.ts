import { activityRepository, profileRepository } from "./profile.repository";

export const getProfile = async (userId: string) => {
	return profileRepository.getProfile(userId);
};

export const getStats = async (userId: string) => {
	return profileRepository.getStats(userId);
};

export const getActivityFeed = async (userId: string, limit = 20) => {
	return activityRepository.getUserFeed(userId, limit);
};

export const updateProfile = async (userId: string, data: { bio?: string }) => {
	await profileRepository.updateBio(userId, data.bio);
	return profileRepository.getProfile(userId);
};
