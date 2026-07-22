import { db } from "@nanahoshi-v2/db";
import { user } from "@nanahoshi-v2/db/schema/auth";
import {
	book,
	library,
	readingProgress,
	serverMemberProfile,
} from "@nanahoshi-v2/db/schema/general";
import { and, count, eq, sql } from "drizzle-orm";
import { READING_STATUSES } from "../../constants";
import {
	accessibleCondition,
	type LibraryScope,
} from "../_shared/library-scope";
import {
	orgAvatarOverrideSql,
	orgBioOverrideSql,
	orgHeaderOverrideSql,
	resolveAvatarSql,
	resolveBioSql,
	resolveHeaderSql,
} from "../_shared/profile-resolve";

export class ProfileRepository {
	async getProfile(userId: string, serverId?: string) {
		const [result] = await db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				image: resolveAvatarSql(serverId),
				headerImage: resolveHeaderSql(serverId),
				bio: resolveBioSql(serverId),
				username: user.username,
				displayUsername: user.displayUsername,
				createdAt: user.createdAt,
				presenceStatus: user.presenceStatus,
				profileColor: user.profileColor,
				// Global account-level values so the settings UI can show what the
				// per-community overrides fall back to.
				globalImage: user.image,
				globalHeaderImage: user.headerImage,
				globalBio: user.bio,
				// Raw per-org overrides (null when inheriting the global default).
				orgImage: orgAvatarOverrideSql(serverId),
				orgHeaderImage: orgHeaderOverrideSql(serverId),
				orgBio: orgBioOverrideSql(serverId),
			})
			.from(user)
			.where(eq(user.id, userId));
		return result ?? null;
	}

	async getProfileByUsername(username: string, serverId?: string) {
		const [result] = await db
			.select({
				id: user.id,
				name: user.name,
				image: resolveAvatarSql(serverId),
				headerImage: resolveHeaderSql(serverId),
				bio: resolveBioSql(serverId),
				username: user.username,
				displayUsername: user.displayUsername,
				createdAt: user.createdAt,
				profileColor: user.profileColor,
			})
			.from(user)
			.where(eq(user.username, username.toLowerCase()));
		return result ?? null;
	}

	/** Update global, account-level profile fields on the `user` table. */
	async updateProfile(
		userId: string,
		data: {
			name?: string;
			bio?: string;
			headerImage?: string;
			profileColor?: string | null;
		},
	) {
		const updates: Partial<{
			name: string;
			bio: string;
			headerImage: string;
			profileColor: string | null;
		}> = {};
		if (data.name !== undefined) updates.name = data.name;
		if (data.bio !== undefined) updates.bio = data.bio;
		if (data.headerImage !== undefined) updates.headerImage = data.headerImage;
		if (data.profileColor !== undefined)
			updates.profileColor = data.profileColor;

		if (Object.keys(updates).length > 0) {
			await db.update(user).set(updates).where(eq(user.id, userId));
		}
	}

	async getShareReadingActivity(userId: string): Promise<boolean> {
		const [result] = await db
			.select({ shareReadingActivity: user.shareReadingActivity })
			.from(user)
			.where(eq(user.id, userId));
		return result?.shareReadingActivity ?? true;
	}

	async setShareReadingActivity(userId: string, value: boolean): Promise<void> {
		await db
			.update(user)
			.set({ shareReadingActivity: value })
			.where(eq(user.id, userId));
	}

	/**
	 * Upsert the per-organization profile override (Discord-style). A field set
	 * to `null` clears that override so the read falls back to the global value;
	 * a field left `undefined` is untouched.
	 */
	async updateOrgProfile(
		userId: string,
		serverId: string,
		data: {
			bio?: string | null;
			headerImage?: string | null;
			image?: string | null;
		},
	) {
		const overrides: Partial<{
			bio: string | null;
			headerImage: string | null;
			image: string | null;
		}> = {};
		if (data.bio !== undefined) overrides.bio = data.bio;
		if (data.headerImage !== undefined)
			overrides.headerImage = data.headerImage;
		if (data.image !== undefined) overrides.image = data.image;

		if (Object.keys(overrides).length === 0) return;

		await db
			.insert(serverMemberProfile)
			.values({ userId, serverId, ...overrides })
			.onConflictDoUpdate({
				target: [serverMemberProfile.userId, serverMemberProfile.serverId],
				set: { ...overrides, updatedAt: sql`now()` },
			});
	}

	async getStats(
		userId: string,
		serverId?: string,
		scope: LibraryScope = "ALL",
	) {
		const [stats] = await db
			.select({
				booksStarted: count(readingProgress.id),
				booksCompleted:
					sql<number>`count(*) filter (where ${readingProgress.status} = ${READING_STATUSES.COMPLETED})`.as(
						"books_completed",
					),
				totalReadingTimeSeconds:
					sql<number>`coalesce(sum(${readingProgress.readingTimeSeconds}), 0)`.as(
						"total_reading_time",
					),
				totalCharsRead:
					sql<number>`coalesce(sum(${readingProgress.exploredCharCount}), 0)`.as(
						"total_chars",
					),
			})
			.from(readingProgress)
			.innerJoin(book, eq(book.id, readingProgress.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(
				and(
					eq(readingProgress.userId, userId),
					eq(library.serverId, serverId ?? ""),
					accessibleCondition(scope),
				),
			);

		return (
			stats ?? {
				booksStarted: 0,
				booksCompleted: 0,
				totalReadingTimeSeconds: 0,
				totalCharsRead: 0,
			}
		);
	}
}

export const profileRepository = new ProfileRepository();
