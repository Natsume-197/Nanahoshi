import { db } from "@nanahoshi-v2/db";
import { member, organization, user } from "@nanahoshi-v2/db/schema/auth";
import { appSettings } from "@nanahoshi-v2/db/schema/general";
import { eq } from "drizzle-orm";
import { ForbiddenError, InternalServerError } from "../errors";
import { logger } from "../lib/logger";

export class SetupRepository {
	/**
	 * Runs the first-setup transaction: locks the first_setup flag, creates the
	 * user (via the provided callback, since it goes through better-auth, not db),
	 * then the org + owner membership, grants the user admin, and marks configured.
	 */
	async completeSetup({
		orgId,
		workspaceName,
		workspaceSlug,
		createUser,
	}: {
		orgId: string;
		workspaceName: string;
		workspaceSlug: string;
		createUser: () => Promise<{ id: string }>;
	}) {
		return db.transaction(async (tx) => {
			// 1. Lock setup status to prevent race conditions
			const [setting] = await tx
				.select({ value: appSettings.value })
				.from(appSettings)
				.where(eq(appSettings.key, "first_setup"))
				.for("update");

			if (setting?.value === true) {
				throw new ForbiddenError("Application is already configured.");
			}

			// 2. Create User via better-auth (not a db call)
			const createdUser = await createUser();

			// 3. Create Organization
			try {
				await tx.insert(organization).values({
					id: orgId,
					name: workspaceName,
					slug: workspaceSlug,
					createdAt: new Date(),
				});

				const memberId = crypto.randomUUID();
				await tx.insert(member).values({
					id: memberId,
					organizationId: orgId,
					userId: createdUser.id,
					role: "owner",
					createdAt: new Date(),
				});
			} catch (err) {
				logger.error({ err }, "Organization creation error");
				throw new InternalServerError("Failed to create organization.");
			}

			// 4. Grant admin role to first user
			await tx
				.update(user)
				.set({ role: "admin" })
				.where(eq(user.id, createdUser.id));

			// 5. Mark configured
			await tx
				.update(appSettings)
				.set({ value: true, updatedAt: new Date() })
				.where(eq(appSettings.key, "first_setup"));

			return { success: true };
		});
	}
}

export const setupRepository = new SetupRepository();
