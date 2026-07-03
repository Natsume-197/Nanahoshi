import { db } from "@nanahoshi-v2/db";
import { user } from "@nanahoshi-v2/db/schema/auth";
import { notification } from "@nanahoshi-v2/db/schema/general";
import {
	and,
	count,
	desc,
	eq,
	inArray,
	isNull,
	lt,
	notInArray,
	sql,
} from "drizzle-orm";
import type {
	ActorRef,
	NotificationData,
	NotificationType,
} from "./notification.model";

// Retention: keep only the newest rows per user, pruned on insert (no cron).
const RETENTION_CAP = 100;

export class NotificationRepository {
	async insertAndPrune(userId: string, data: NotificationData) {
		return db.transaction(async (tx) => {
			const [row] = await tx
				.insert(notification)
				.values({ userId, type: data.type, payload: data })
				.returning();
			if (!row) throw new Error("notification insert returned no row");
			const keep = tx
				.select({ id: notification.id })
				.from(notification)
				.where(eq(notification.userId, userId))
				.orderBy(desc(notification.id))
				.limit(RETENTION_CAP);
			await tx
				.delete(notification)
				.where(
					and(
						eq(notification.userId, userId),
						notInArray(notification.id, keep),
					),
				);
			return row;
		});
	}

	async list(userId: string, limit = 20, cursor?: number) {
		return db
			.select()
			.from(notification)
			.where(
				and(
					eq(notification.userId, userId),
					cursor !== undefined ? lt(notification.id, cursor) : undefined,
				),
			)
			.orderBy(desc(notification.id))
			.limit(limit);
	}

	async unreadCount(userId: string) {
		const [row] = await db
			.select({ count: count() })
			.from(notification)
			.where(and(eq(notification.userId, userId), isNull(notification.readAt)));
		return row?.count ?? 0;
	}

	async markAllRead(userId: string) {
		await db
			.update(notification)
			.set({ readAt: sql`now()` })
			.where(and(eq(notification.userId, userId), isNull(notification.readAt)));
	}

	async markRead(userId: string, ids: number[]) {
		await db
			.update(notification)
			.set({ readAt: sql`now()` })
			.where(
				and(
					eq(notification.userId, userId),
					inArray(notification.id, ids),
					isNull(notification.readAt),
				),
			);
	}

	async deleteById(userId: string, id: number) {
		await db
			.delete(notification)
			.where(and(eq(notification.userId, userId), eq(notification.id, id)));
	}

	// Anti-flap: an unlike/unfollow retracts the notification it produced,
	// matched through the jsonb payload (fine unindexed at the retention cap).
	async deleteByActorTarget(
		userId: string,
		types: NotificationType[],
		actorId: string,
		activityId?: number,
	) {
		await db
			.delete(notification)
			.where(
				and(
					eq(notification.userId, userId),
					inArray(notification.type, types),
					sql`${notification.payload}->'actor'->>'id' = ${actorId}`,
					activityId !== undefined
						? sql`(${notification.payload}->>'activityId')::bigint = ${activityId}`
						: undefined,
				),
			);
	}

	/** Returns the affected recipients so their tabs can be told to refresh. */
	async deleteByComment(commentId: number) {
		const rows = await db
			.delete(notification)
			.where(
				and(
					eq(notification.type, "activity_comment"),
					sql`(${notification.payload}->>'commentId')::bigint = ${commentId}`,
				),
			)
			.returning({ userId: notification.userId });
		return [...new Set(rows.map((r) => r.userId))];
	}

	async getActorRef(userId: string): Promise<ActorRef | null> {
		const [row] = await db
			.select({
				id: user.id,
				name: user.name,
				username: user.username,
				displayUsername: user.displayUsername,
			})
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);
		return row ?? null;
	}
}

export const notificationRepository = new NotificationRepository();
