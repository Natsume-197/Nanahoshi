import { db } from "@nanahoshi-v2/db";
import { member } from "@nanahoshi-v2/db/schema/auth";
import { memberRole } from "@nanahoshi-v2/db/schema/general";
import { and, eq } from "drizzle-orm";

export const membersRepository = {
	findMember(userId: string, organizationId: string) {
		return db
			.select({ id: member.id, role: member.role })
			.from(member)
			.where(
				and(
					eq(member.userId, userId),
					eq(member.organizationId, organizationId),
				),
			)
			.limit(1)
			.then((rows) => rows[0]);
	},

	/** Removes the membership and its assigned roles in one transaction. */
	removeWithRoles(userId: string, organizationId: string) {
		return db.transaction(async (tx) => {
			await tx
				.delete(memberRole)
				.where(
					and(
						eq(memberRole.userId, userId),
						eq(memberRole.organizationId, organizationId),
					),
				);
			await tx
				.delete(member)
				.where(
					and(
						eq(member.userId, userId),
						eq(member.organizationId, organizationId),
					),
				);
		});
	},

	/** Demotes the current owner to member and promotes the target to owner. */
	transferOwnership(
		currentOwnerUserId: string,
		targetUserId: string,
		organizationId: string,
	) {
		return db.transaction(async (tx) => {
			await tx
				.update(member)
				.set({ role: "member" })
				.where(
					and(
						eq(member.userId, currentOwnerUserId),
						eq(member.organizationId, organizationId),
					),
				);
			await tx
				.update(member)
				.set({ role: "owner" })
				.where(
					and(
						eq(member.userId, targetUserId),
						eq(member.organizationId, organizationId),
					),
				);
		});
	},
};
