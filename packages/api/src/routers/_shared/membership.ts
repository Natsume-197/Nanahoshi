import { db } from "@nanahoshi-v2/db";
import { member } from "@nanahoshi-v2/db/schema/auth";
import { and, eq } from "drizzle-orm";

/**
 * Whether `userId` is a member of `organizationId`. Used to gate cross-user
 * profile reads so you can only view profiles of people in your active org
 * (communities are isolated).
 */
export async function isMember(
	userId: string,
	organizationId: string,
): Promise<boolean> {
	const [row] = await db
		.select({ id: member.id })
		.from(member)
		.where(
			and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
		)
		.limit(1);
	return Boolean(row);
}
