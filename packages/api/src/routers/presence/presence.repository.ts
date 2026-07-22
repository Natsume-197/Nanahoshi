import { db } from "@nanahoshi-v2/db";
import { user } from "@nanahoshi-v2/db/schema/auth";
import { eq } from "drizzle-orm";
import type { ManualPresenceStatus } from "../../modules/presence/presence.types";

export class PresenceRepository {
	async getStatus(userId: string): Promise<ManualPresenceStatus> {
		const [result] = await db
			.select({ status: user.presenceStatus })
			.from(user)
			.where(eq(user.id, userId));
		return result?.status ?? "online";
	}

	async setStatus(userId: string, status: ManualPresenceStatus) {
		await db
			.update(user)
			.set({ presenceStatus: status })
			.where(eq(user.id, userId));
	}
}

export const presenceRepository = new PresenceRepository();
