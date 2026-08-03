import { db } from "@nanahoshi-v2/db";
import { user } from "@nanahoshi-v2/db/schema/auth";
import {
	book,
	library,
	readingProgress,
} from "@nanahoshi-v2/db/schema/general";
import { and, count, eq, sql } from "drizzle-orm";
import { READING_STATUSES } from "../../constants";
import {
	accessibleCondition,
	type LibraryScope,
} from "../_shared/library-scope";

export class ProfileRepository {
	async getProfile(userId: string) {
		const [result] = await db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				image: user.image,
				headerImage: user.headerImage,
				username: user.username,
				displayUsername: user.displayUsername,
				createdAt: user.createdAt,
				presenceStatus: user.presenceStatus,
			})
			.from(user)
			.where(eq(user.id, userId));
		return result ?? null;
	}

	async getProfileByUsername(username: string) {
		const [result] = await db
			.select({
				id: user.id,
				name: user.name,
				image: user.image,
				headerImage: user.headerImage,
				username: user.username,
				displayUsername: user.displayUsername,
				createdAt: user.createdAt,
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
			headerImage?: string;
		},
	) {
		const updates: Partial<{
			name: string;
			headerImage: string;
		}> = {};
		if (data.name !== undefined) updates.name = data.name;
		if (data.headerImage !== undefined) updates.headerImage = data.headerImage;

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
