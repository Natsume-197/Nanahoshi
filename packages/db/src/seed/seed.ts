import { db } from "@nanahoshi-v2/db";
import { appSettings } from "../schema/general";

export async function firstSeed() {
	console.log("Starting seed...");

	// Check if database is populated
	const existing = await db.select().from(appSettings).limit(1);

	if (existing.length > 0) {
		console.log("Seed skipped: application already initialized.");
		return;
	}

	// If not, we populated with default settings
	console.log("Running initial seed...");

	await db.insert(appSettings).values([
		{
			key: "first_setup",
			value: false,
		},
	]);

	console.log("Seed completed successfully");
}
