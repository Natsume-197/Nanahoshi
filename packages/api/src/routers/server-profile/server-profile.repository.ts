import { db } from "@nanahoshi-v2/db";
import { organization } from "@nanahoshi-v2/db/schema/auth";
import { eq } from "drizzle-orm";
import type { UpdateServerProfileInput } from "./server-profile.model";

export class ServerProfileRepository {
	async getProfile(serverId: string) {
		const [org] = await db
			.select({
				id: organization.id,
				name: organization.name,
				slug: organization.slug,
				logo: organization.logo,
				background: organization.background,
			})
			.from(organization)
			.where(eq(organization.id, serverId));
		return org ?? null;
	}

	/** Deletes the organization row; scoped data (libraries, books, members…) follows via FK cascades. */
	async deleteServer(serverId: string) {
		await db.delete(organization).where(eq(organization.id, serverId));
	}

	async updateProfile(serverId: string, patch: UpdateServerProfileInput) {
		const [updated] = await db
			.update(organization)
			.set(patch)
			.where(eq(organization.id, serverId))
			.returning({
				id: organization.id,
				name: organization.name,
				slug: organization.slug,
				logo: organization.logo,
				background: organization.background,
			});
		return updated ?? null;
	}
}

export const serverProfileRepository = new ServerProfileRepository();
