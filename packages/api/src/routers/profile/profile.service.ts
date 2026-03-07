import { activityRepository, profileRepository } from "./profile.repository";

export const getProfile = async (userId: string) => {
	return profileRepository.getProfile(userId);
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

export const getActivityFeed = async (
	userId: string,
	limit = 20,
	organizationId?: string,
) => {
	return activityRepository.getUserFeed(userId, limit, organizationId);
};

export const updateProfile = async (
	userId: string,
	data: { name?: string; bio?: string },
) => {
	await profileRepository.updateProfile(userId, data);
	return profileRepository.getProfile(userId);
};
