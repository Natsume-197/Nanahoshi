import { NotFoundError } from "../../errors";
import * as presence from "../../modules/presence/presenceManager";
import type { LibraryScope } from "../_shared/library-scope";
import { membersRepository } from "../members/members.repository";
import { profileRepository } from "./profile.repository";

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

export const updateProfile = async (
	userId: string,
	data: {
		name?: string;
		bio?: string;
		headerImage?: string;
	},
) => {
	await profileRepository.updateProfile(userId, data);
	return profileRepository.getProfile(userId);
};

export const getPrivacy = async (userId: string) => {
	return {
		shareReadingActivity:
			await profileRepository.getShareReadingActivity(userId),
	};
};

export const updatePrivacy = async (
	userId: string,
	data: { shareReadingActivity: boolean },
) => {
	await profileRepository.setShareReadingActivity(
		userId,
		data.shareReadingActivity,
	);
	// Turning sharing off must hide the book being read *now*, not only the next
	// one — drop the live activity so the panel falls back to online/away.
	if (!data.shareReadingActivity) {
		await presence.clearActivity(userId);
	}
	return { shareReadingActivity: data.shareReadingActivity };
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
