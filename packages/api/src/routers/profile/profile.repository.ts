import { db } from "@nanahoshi-v2/db";
import { user } from "@nanahoshi-v2/db/schema/auth";
import {
	activity,
	activityComment,
	activityLike,
	author,
	book,
	bookAuthor,
	bookMetadata,
	library,
	orgMemberProfile,
	readingProgress,
} from "@nanahoshi-v2/db/schema/general";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { ActivityType } from "../../constants";
import { READING_STATUSES } from "../../constants";
import {
	orgAvatarOverrideSql,
	orgBioOverrideSql,
	orgHeaderOverrideSql,
	resolveAvatarSql,
	resolveBioSql,
	resolveHeaderSql,
} from "../_shared/profile-resolve";

/** Correlated subquery selecting the display author (lowest id) for a book. */
const firstAuthorNameSql = sql<
	string | null
>`(SELECT ${author.name} FROM ${bookAuthor} JOIN ${author} ON ${author.id} = ${bookAuthor.authorId} WHERE ${bookAuthor.bookId} = ${book.id} ORDER BY ${author.id} LIMIT 1)`;

export class ProfileRepository {
	async getProfile(userId: string, organizationId?: string) {
		const [result] = await db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				image: resolveAvatarSql(organizationId),
				headerImage: resolveHeaderSql(organizationId),
				bio: resolveBioSql(organizationId),
				username: user.username,
				displayUsername: user.displayUsername,
				createdAt: user.createdAt,
				// Global account-level values so the settings UI can show what the
				// per-community overrides fall back to.
				globalImage: user.image,
				globalHeaderImage: user.headerImage,
				globalBio: user.bio,
				// Raw per-org overrides (null when inheriting the global default).
				orgImage: orgAvatarOverrideSql(organizationId),
				orgHeaderImage: orgHeaderOverrideSql(organizationId),
				orgBio: orgBioOverrideSql(organizationId),
			})
			.from(user)
			.where(eq(user.id, userId));
		return result ?? null;
	}

	async getProfileByUsername(username: string, organizationId?: string) {
		const [result] = await db
			.select({
				id: user.id,
				name: user.name,
				image: resolveAvatarSql(organizationId),
				headerImage: resolveHeaderSql(organizationId),
				bio: resolveBioSql(organizationId),
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
		data: { name?: string; bio?: string; headerImage?: string },
	) {
		const updates: Partial<{ name: string; bio: string; headerImage: string }> =
			{};
		if (data.name !== undefined) updates.name = data.name;
		if (data.bio !== undefined) updates.bio = data.bio;
		if (data.headerImage !== undefined) updates.headerImage = data.headerImage;

		if (Object.keys(updates).length > 0) {
			await db.update(user).set(updates).where(eq(user.id, userId));
		}
	}

	/**
	 * Upsert the per-organization profile override (Discord-style). A field set
	 * to `null` clears that override so the read falls back to the global value;
	 * a field left `undefined` is untouched.
	 */
	async updateOrgProfile(
		userId: string,
		organizationId: string,
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
			.insert(orgMemberProfile)
			.values({ userId, organizationId, ...overrides })
			.onConflictDoUpdate({
				target: [orgMemberProfile.userId, orgMemberProfile.organizationId],
				set: { ...overrides, updatedAt: sql`now()` },
			});
	}

	async getStats(userId: string, organizationId?: string) {
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
					eq(library.organizationId, organizationId ?? ""),
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

	/**
	 * Daily reading-activity counts for the last 53 weeks, scoped to the org.
	 * Powers the GitHub-style contribution heatmap. Returns only days with at
	 * least one event; the frontend fills the empty cells of the calendar grid.
	 */
	async getActivityCalendar(userId: string, organizationId?: string) {
		if (!organizationId) return [] as Array<{ day: string; count: number }>;

		const dayExpr = sql`date_trunc('day', ${activity.createdAt})`;
		return db
			.select({
				day: sql<string>`to_char(${dayExpr}, 'YYYY-MM-DD')`,
				count: sql<number>`count(*)::int`,
			})
			.from(activity)
			.innerJoin(book, eq(book.id, activity.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(
				and(
					eq(activity.userId, userId),
					eq(library.organizationId, organizationId),
					sql`${activity.createdAt} >= now() - interval '53 weeks'`,
				),
			)
			.groupBy(dayExpr)
			.orderBy(dayExpr);
	}
}

export class ActivityRepository {
	async insert(
		userId: string,
		type: ActivityType,
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
		type: ActivityType,
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

	async getUserFeed(userId: string, limit = 20, organizationId?: string) {
		if (!organizationId) return [];

		const likesSubquery = db
			.select({
				activityId: activityLike.activityId,
				likeCount: count().as("like_count"),
			})
			.from(activityLike)
			// Optimize: only calculate likes for this user's activities
			.innerJoin(activity, eq(activity.id, activityLike.activityId))
			.where(eq(activity.userId, userId))
			.groupBy(activityLike.activityId)
			.as("likes_sq");

		const commentsSubquery = db
			.select({
				activityId: activityComment.activityId,
				commentCount: count().as("comment_count"),
			})
			.from(activityComment)
			// Optimize: only calculate comments for this user's activities
			.innerJoin(activity, eq(activity.id, activityComment.activityId))
			.where(eq(activity.userId, userId))
			.groupBy(activityComment.activityId)
			.as("comments_sq");

		return db
			.select({
				id: activity.id,
				type: activity.type,
				createdAt: activity.createdAt,
				bookId: activity.bookId,
				bookUuid: book.uuid,
				title: bookMetadata.title,
				cover: bookMetadata.cover,
				author: firstAuthorNameSql,
				likeCount: sql<number>`coalesce(${likesSubquery.likeCount}, 0)::int`,
				commentCount: sql<number>`coalesce(${commentsSubquery.commentCount}, 0)::int`,
			})
			.from(activity)
			.innerJoin(book, eq(book.id, activity.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.leftJoin(likesSubquery, eq(likesSubquery.activityId, activity.id))
			.leftJoin(commentsSubquery, eq(commentsSubquery.activityId, activity.id))
			.where(
				and(
					eq(activity.userId, userId),
					eq(library.organizationId, organizationId),
				),
			)
			.orderBy(desc(activity.createdAt))
			.limit(limit);
	}

	async getGlobalFeed(organizationId: string, limit = 20, cursor?: number) {
		const conditions = [eq(library.organizationId, organizationId)];
		if (cursor) {
			conditions.push(
				sql`(${activity.createdAt}, ${activity.id}) < ((SELECT created_at FROM ${activity} WHERE id = ${cursor}), ${cursor})`,
			);
		}

		const likesSubquery = db
			.select({
				activityId: activityLike.activityId,
				likeCount: count().as("like_count"),
			})
			.from(activityLike)
			.innerJoin(activity, eq(activity.id, activityLike.activityId))
			.innerJoin(book, eq(book.id, activity.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(eq(library.organizationId, organizationId))
			.groupBy(activityLike.activityId)
			.as("likes_sq");

		const commentsSubquery = db
			.select({
				activityId: activityComment.activityId,
				commentCount: count().as("comment_count"),
			})
			.from(activityComment)
			.innerJoin(activity, eq(activity.id, activityComment.activityId))
			.innerJoin(book, eq(book.id, activity.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(eq(library.organizationId, organizationId))
			.groupBy(activityComment.activityId)
			.as("comments_sq");

		return db
			.select({
				id: activity.id,
				type: activity.type,
				createdAt: activity.createdAt,
				bookId: activity.bookId,
				bookUuid: book.uuid,
				title: bookMetadata.title,
				cover: bookMetadata.cover,
				author: firstAuthorNameSql,
				userId: activity.userId,
				userName: user.name,
				userImage: resolveAvatarSql(organizationId),
				userUsername: user.username,
				userDisplayUsername: user.displayUsername,
				likeCount: sql<number>`coalesce(${likesSubquery.likeCount}, 0)::int`,
				commentCount: sql<number>`coalesce(${commentsSubquery.commentCount}, 0)::int`,
			})
			.from(activity)
			.innerJoin(user, eq(user.id, activity.userId))
			.innerJoin(book, eq(book.id, activity.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.leftJoin(likesSubquery, eq(likesSubquery.activityId, activity.id))
			.leftJoin(commentsSubquery, eq(commentsSubquery.activityId, activity.id))
			.where(and(...conditions))
			.orderBy(desc(activity.createdAt), desc(activity.id))
			.limit(limit);
	}

	async getFollowingFeed(
		userId: string,
		organizationId: string,
		limit = 20,
		cursor?: number,
	) {
		const conditions = [
			eq(library.organizationId, organizationId),
			sql`(${activity.userId} = ${userId} OR ${activity.userId} IN (SELECT following_id FROM user_follow WHERE follower_id = ${userId}))`,
		];
		if (cursor) {
			conditions.push(
				sql`(${activity.createdAt}, ${activity.id}) < ((SELECT created_at FROM ${activity} WHERE id = ${cursor}), ${cursor})`,
			);
		}

		const likesSubquery = db
			.select({
				activityId: activityLike.activityId,
				likeCount: count().as("like_count"),
			})
			.from(activityLike)
			.innerJoin(activity, eq(activity.id, activityLike.activityId))
			.innerJoin(book, eq(book.id, activity.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(eq(library.organizationId, organizationId))
			.groupBy(activityLike.activityId)
			.as("likes_sq");

		const commentsSubquery = db
			.select({
				activityId: activityComment.activityId,
				commentCount: count().as("comment_count"),
			})
			.from(activityComment)
			.innerJoin(activity, eq(activity.id, activityComment.activityId))
			.innerJoin(book, eq(book.id, activity.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(eq(library.organizationId, organizationId))
			.groupBy(activityComment.activityId)
			.as("comments_sq");

		return db
			.select({
				id: activity.id,
				type: activity.type,
				createdAt: activity.createdAt,
				bookId: activity.bookId,
				bookUuid: book.uuid,
				title: bookMetadata.title,
				cover: bookMetadata.cover,
				author: firstAuthorNameSql,
				userId: activity.userId,
				userName: user.name,
				userImage: resolveAvatarSql(organizationId),
				userUsername: user.username,
				userDisplayUsername: user.displayUsername,
				likeCount: sql<number>`coalesce(${likesSubquery.likeCount}, 0)::int`,
				commentCount: sql<number>`coalesce(${commentsSubquery.commentCount}, 0)::int`,
			})
			.from(activity)
			.innerJoin(user, eq(user.id, activity.userId))
			.innerJoin(book, eq(book.id, activity.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.leftJoin(likesSubquery, eq(likesSubquery.activityId, activity.id))
			.leftJoin(commentsSubquery, eq(commentsSubquery.activityId, activity.id))
			.where(and(...conditions))
			.orderBy(desc(activity.createdAt), desc(activity.id))
			.limit(limit);
	}

	// Activity interactions
	async likeActivity(userId: string, activityId: number) {
		await db
			.insert(activityLike)
			.values({ userId, activityId })
			.onConflictDoNothing({
				target: [activityLike.userId, activityLike.activityId],
			});
	}

	async unlikeActivity(userId: string, activityId: number) {
		await db
			.delete(activityLike)
			.where(
				and(
					eq(activityLike.userId, userId),
					eq(activityLike.activityId, activityId),
				),
			);
	}

	async isActivityLiked(userId: string, activityId: number) {
		const [result] = await db
			.select({ count: count() })
			.from(activityLike)
			.where(
				and(
					eq(activityLike.userId, userId),
					eq(activityLike.activityId, activityId),
				),
			);
		return (result?.count ?? 0) > 0;
	}

	async addComment(userId: string, activityId: number, content: string) {
		const [result] = await db
			.insert(activityComment)
			.values({ userId, activityId, content })
			.returning({
				id: activityComment.id,
				content: activityComment.content,
				createdAt: activityComment.createdAt,
			});
		return result;
	}

	async deleteComment(commentId: number, userId: string) {
		await db
			.delete(activityComment)
			.where(
				and(
					eq(activityComment.id, commentId),
					eq(activityComment.userId, userId),
				),
			);
	}

	async getComments(activityId: number, limit = 20, organizationId?: string) {
		return db
			.select({
				id: activityComment.id,
				content: activityComment.content,
				createdAt: activityComment.createdAt,
				userId: activityComment.userId,
				userName: user.name,
				userImage: resolveAvatarSql(organizationId),
				userUsername: user.username,
				userDisplayUsername: user.displayUsername,
			})
			.from(activityComment)
			.innerJoin(user, eq(user.id, activityComment.userId))
			.where(eq(activityComment.activityId, activityId))
			.orderBy(desc(activityComment.createdAt))
			.limit(limit);
	}

	async getLikedActivityIds(userId: string, activityIds: number[]) {
		if (activityIds.length === 0) return [];
		const results = await db
			.select({ activityId: activityLike.activityId })
			.from(activityLike)
			.where(
				and(
					eq(activityLike.userId, userId),
					inArray(activityLike.activityId, activityIds),
				),
			);
		return results.map((r) => r.activityId);
	}
}

export const profileRepository = new ProfileRepository();
export const activityRepository = new ActivityRepository();
