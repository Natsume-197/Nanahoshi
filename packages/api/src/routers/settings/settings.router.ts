import { db } from "@nanahoshi-v2/db";
import { appSettings } from "@nanahoshi-v2/db/schema/general";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure } from "../../index";
import {
	type AmazonConfig,
	getAmazonConfig,
} from "../../modules/settings.service";

const AmazonConfigSchema = z.object({
	domain: z.string().min(1),
	cookie: z.string().optional(),
	enabled: z.boolean(),
});

export const settingsRouter = {
	getAmazon: adminProcedure.handler(async (): Promise<AmazonConfig> => {
		return await getAmazonConfig();
	}),

	updateAmazon: adminProcedure
		.input(AmazonConfigSchema.partial())
		.handler(async ({ input }) => {
			const current = await getAmazonConfig();
			const updated: AmazonConfig = { ...current, ...input };

			const existing = await db
				.select({ id: appSettings.id })
				.from(appSettings)
				.where(eq(appSettings.key, "amazon"))
				.limit(1);

			if (existing.length === 0) {
				await db.insert(appSettings).values({
					key: "amazon",
					value: updated,
				});
			} else {
				await db
					.update(appSettings)
					.set({ value: updated, updatedAt: new Date() })
					.where(eq(appSettings.key, "amazon"));
			}

			return updated;
		}),
};
