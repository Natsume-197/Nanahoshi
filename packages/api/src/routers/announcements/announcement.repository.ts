import { db } from "@nanahoshi/db";
import {
	type Announcement,
	announcement,
	announcementDismissal,
} from "@nanahoshi/db/schema/general";
import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import type { AnnouncementFields } from "./announcement.model";

/** `null` = the instance scope, a string = that server's scope. */
export type AnnouncementScope = string | null;

function inScope(scope: AnnouncementScope) {
	return scope === null
		? isNull(announcement.serverId)
		: eq(announcement.serverId, scope);
}

export class AnnouncementRepository {
	async listByScope(scope: AnnouncementScope) {
		return db
			.select()
			.from(announcement)
			.where(inScope(scope))
			.orderBy(desc(announcement.createdAt));
	}

	async findInScope(id: string, scope: AnnouncementScope) {
		const [row] = await db
			.select()
			.from(announcement)
			.where(and(eq(announcement.id, id), inScope(scope)))
			.limit(1);
		return row ?? null;
	}

	async findById(id: string) {
		const [row] = await db
			.select()
			.from(announcement)
			.where(eq(announcement.id, id))
			.limit(1);
		return row ?? null;
	}

	async create(
		scope: AnnouncementScope,
		createdBy: string,
		fields: AnnouncementFields,
	) {
		const [row] = await db
			.insert(announcement)
			.values({ ...fields, serverId: scope, createdBy })
			.returning();
		if (!row) throw new Error("announcement insert returned no row");
		return row;
	}

	/** Updates the row and, when asked, forgets who dismissed it — atomically. */
	async update(
		id: string,
		scope: AnnouncementScope,
		fields: AnnouncementFields,
		resetDismissals: boolean,
	): Promise<Announcement | null> {
		return db.transaction(async (tx) => {
			const [row] = await tx
				.update(announcement)
				.set({ ...fields, updatedAt: sql`now()` })
				.where(and(eq(announcement.id, id), inScope(scope)))
				.returning();
			if (!row) return null;
			if (resetDismissals) {
				await tx
					.delete(announcementDismissal)
					.where(eq(announcementDismissal.announcementId, id));
			}
			return row;
		});
	}

	async delete(id: string, scope: AnnouncementScope) {
		const rows = await db
			.delete(announcement)
			.where(and(eq(announcement.id, id), inScope(scope)))
			.returning({ id: announcement.id });
		return rows.length > 0;
	}

	/**
	 * Banners live right now for this user: the instance's plus the given
	 * server's, minus the dismissible ones they already closed.
	 */
	async listActiveForUser(userId: string, serverId: string | null) {
		const now = sql`now()`;
		const notDismissed = sql`NOT EXISTS (
			SELECT 1 FROM ${announcementDismissal}
			WHERE ${announcementDismissal.announcementId} = ${announcement.id}
			AND ${announcementDismissal.userId} = ${userId}
		)`;
		return db
			.select()
			.from(announcement)
			.where(
				and(
					serverId === null
						? isNull(announcement.serverId)
						: or(
								isNull(announcement.serverId),
								eq(announcement.serverId, serverId),
							),
					or(isNull(announcement.startsAt), lte(announcement.startsAt, now)),
					or(isNull(announcement.endsAt), gt(announcement.endsAt, now)),
					or(eq(announcement.dismissible, false), notDismissed),
				),
			)
			.orderBy(desc(announcement.createdAt));
	}

	async dismiss(announcementId: string, userId: string) {
		await db
			.insert(announcementDismissal)
			.values({ announcementId, userId })
			.onConflictDoNothing();
	}
}

export const announcementRepository = new AnnouncementRepository();
