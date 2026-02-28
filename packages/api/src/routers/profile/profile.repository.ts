import { db } from "@nanahoshi-v2/db";
import { user } from "@nanahoshi-v2/db/schema/auth";
import {
	activity,
	book,
	bookMetadata,
	readingProgress,
} from "@nanahoshi-v2/db/schema/general";
import { and, count, desc, eq, sql } from "drizzle-orm";

export class ProfileRepository {
	async getProfile(userId: string) {
		const [result] = await db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				image: user.image,
				bio: user.bio,
				createdAt: user.createdAt,
			})
			.from(user)
			.where(eq(user.id, userId));
		return result ?? null;
	}

	async updateBio(userId: string, bio: string | undefined) {
		await db.update(user).set({ bio }).where(eq(user.id, userId));
	}

	async getStats(userId: string) {
		const [stats] = await db
			.select({
				booksStarted: count(readingProgress.id),
				booksCompleted:
					sql<number>`count(*) filter (where ${readingProgress.status} = 'completed')`.as(
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
			.where(eq(readingProgress.userId, userId));

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

export class ActivityRepository {
	async insert(
		userId: string,
		type: "started_reading" | "completed_reading" | "liked_book",
		bookId: number,
		metadata?: unknown,
	) {
		await db.insert(activity).values({
			userId,
			type,
			bookId,
			metadata: metadata ?? null,
		});
	}

	async deleteByUserBookAndType(
		userId: string,
		bookId: number,
		type: "started_reading" | "completed_reading" | "liked_book",
	) {
		await db
			.delete(activity)
			.where(
				and(
					eq(activity.userId, userId),
					eq(activity.bookId, bookId),
					eq(activity.type, type),
				),
			);
	}

	async getUserFeed(userId: string, limit = 20) {
		return db
			.select({
				id: activity.id,
				type: activity.type,
				createdAt: activity.createdAt,
				bookId: activity.bookId,
				bookUuid: book.uuid,
				title: bookMetadata.title,
				cover: bookMetadata.cover,
			})
			.from(activity)
			.innerJoin(book, eq(book.id, activity.bookId))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.where(eq(activity.userId, userId))
			.orderBy(desc(activity.createdAt))
			.limit(limit);
	}
}

export const profileRepository = new ProfileRepository();
export const activityRepository = new ActivityRepository();
