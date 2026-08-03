import { db } from "@nanahoshi-v2/db";
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
import type { NotificationData } from "./notification.model";

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
}

export const notificationRepository = new NotificationRepository();
