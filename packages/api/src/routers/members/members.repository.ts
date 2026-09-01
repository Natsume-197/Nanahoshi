import { db } from "@nanahoshi-v2/db";
import { member, user } from "@nanahoshi-v2/db/schema/auth";
import { memberRole } from "@nanahoshi-v2/db/schema/general";
import { and, asc, eq } from "drizzle-orm";

export class MembersRepository {
	/** Discord-style roster for the active server, capped by `limit`. */
	list(serverId: string, limit: number) {
		return db
			.select({
				id: user.id,
				name: user.name,
				username: user.username,
				displayUsername: user.displayUsername,
				image: user.image,
				headerImage: user.headerImage,
			})
			.from(member)
			.innerJoin(user, eq(user.id, member.userId))
			.where(eq(member.organizationId, serverId))
			.orderBy(asc(user.name), asc(user.id))
			.limit(limit);
	}

	async listIds(serverId: string): Promise<string[]> {
		const rows = await db
			.select({ id: member.userId })
			.from(member)
			.where(eq(member.organizationId, serverId));
		return rows.map((row) => row.id);
	}

	// Whether `userId` is a member of `serverId`. Gates cross-user profile reads
	// so you only view profiles of people in your active org (communities isolated).
	async isMember(userId: string, serverId: string): Promise<boolean> {
		const [row] = await db
			.select({ id: member.id })
			.from(member)
			.where(
				and(eq(member.userId, userId), eq(member.organizationId, serverId)),
			)
			.limit(1);
		return Boolean(row);
	}

	findMember(userId: string, serverId: string) {
		return db
			.select({ id: member.id, role: member.role })
			.from(member)
			.where(
				and(eq(member.userId, userId), eq(member.organizationId, serverId)),
			)
			.limit(1)
			.then((rows) => rows[0]);
	}

	/** Removes the membership and its assigned roles in one transaction. */
	removeWithRoles(userId: string, serverId: string) {
		return db.transaction(async (tx) => {
			await tx
				.delete(memberRole)
				.where(
					and(eq(memberRole.userId, userId), eq(memberRole.serverId, serverId)),
				);
			await tx
				.delete(member)
				.where(
					and(eq(member.userId, userId), eq(member.organizationId, serverId)),
				);
		});
	}

	/** Demotes the current owner to member and promotes the target to owner. */
	transferOwnership(
		currentOwnerUserId: string,
		targetUserId: string,
		serverId: string,
	) {
		return db.transaction(async (tx) => {
			await tx
				.update(member)
				.set({ role: "member" })
				.where(
					and(
						eq(member.userId, currentOwnerUserId),
						eq(member.organizationId, serverId),
					),
				);
			await tx
				.update(member)
				.set({ role: "owner" })
				.where(
					and(
						eq(member.userId, targetUserId),
						eq(member.organizationId, serverId),
					),
				);
		});
	}
}

export const membersRepository = new MembersRepository();
