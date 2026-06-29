import { db } from "@nanahoshi-v2/db";
import { member } from "@nanahoshi-v2/db/schema/auth";
import { memberRole } from "@nanahoshi-v2/db/schema/general";
import { and, eq } from "drizzle-orm";

export class MembersRepository {
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
