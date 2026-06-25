import { db } from "@nanahoshi-v2/db";
import { member, user } from "@nanahoshi-v2/db/schema/auth";
import { userFollow } from "@nanahoshi-v2/db/schema/general";
import { and, count, desc, eq, ne, notInArray, sql } from "drizzle-orm";
import { resolveAvatarSql } from "../_shared/profile-resolve";

export class FollowRepository {
	async follow(followerId: string, followingId: string) {
		await db
			.insert(userFollow)
			.values({ followerId, followingId })
			.onConflictDoNothing();
	}

	async unfollow(followerId: string, followingId: string) {
		await db
			.delete(userFollow)
			.where(
				and(
					eq(userFollow.followerId, followerId),
					eq(userFollow.followingId, followingId),
				),
			);
	}

	async isFollowing(followerId: string, followingId: string) {
		const [result] = await db
			.select({ count: count() })
			.from(userFollow)
			.where(
				and(
					eq(userFollow.followerId, followerId),
					eq(userFollow.followingId, followingId),
				),
			);
		return (result?.count ?? 0) > 0;
	}

	async getCounts(userId: string) {
		const [followers] = await db
			.select({ count: count() })
			.from(userFollow)
			.where(eq(userFollow.followingId, userId));

		const [following] = await db
			.select({ count: count() })
			.from(userFollow)
			.where(eq(userFollow.followerId, userId));

		return {
			followers: followers?.count ?? 0,
			following: following?.count ?? 0,
		};
	}

	async getFollowers(userId: string, limit = 20, serverId?: string) {
		return db
			.select({
				id: user.id,
				name: user.name,
				username: user.username,
				displayUsername: user.displayUsername,
				image: resolveAvatarSql(serverId),
				followedAt: userFollow.createdAt,
			})
			.from(userFollow)
			.innerJoin(user, eq(user.id, userFollow.followerId))
			.where(eq(userFollow.followingId, userId))
			.orderBy(desc(userFollow.createdAt))
			.limit(limit);
	}

	async getFollowing(userId: string, limit = 20, serverId?: string) {
		return db
			.select({
				id: user.id,
				name: user.name,
				username: user.username,
				displayUsername: user.displayUsername,
				image: resolveAvatarSql(serverId),
				followedAt: userFollow.createdAt,
			})
			.from(userFollow)
			.innerJoin(user, eq(user.id, userFollow.followingId))
			.where(eq(userFollow.followerId, userId))
			.orderBy(desc(userFollow.createdAt))
			.limit(limit);
	}

	async getSuggestions(userId: string, serverId: string, limit = 5) {
		// Users this person already follows (plus themselves) are excluded.
		const followingSubquery = db
			.select({ id: userFollow.followingId })
			.from(userFollow)
			.where(eq(userFollow.followerId, userId));

		return db
			.select({
				id: user.id,
				name: user.name,
				username: user.username,
				displayUsername: user.displayUsername,
				image: resolveAvatarSql(serverId),
				followerCount: sql<number>`(SELECT count(*)::int FROM ${userFollow} WHERE ${userFollow.followingId} = ${user.id})`,
			})
			.from(member)
			.innerJoin(user, eq(user.id, member.userId))
			.where(
				and(
					eq(member.organizationId, serverId),
					ne(user.id, userId),
					notInArray(user.id, followingSubquery),
				),
			)
			.orderBy(
				desc(
					sql`(SELECT count(*) FROM ${userFollow} WHERE ${userFollow.followingId} = ${user.id})`,
				),
				desc(member.createdAt),
			)
			.limit(limit);
	}

	async getUserIdByUsername(username: string): Promise<string | null> {
		const [result] = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.username, username.toLowerCase()));
		return result?.id ?? null;
	}
}

export const followRepository = new FollowRepository();
