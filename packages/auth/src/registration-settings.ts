import { db } from "@nanahoshi-v2/db";
import { appSettings } from "@nanahoshi-v2/db/schema/general";
import { eq } from "drizzle-orm";
import {
	normalizeRegistrationSettings,
	type RegistrationSettings,
} from "./signup-gate.rules";

export {
	DEFAULT_REGISTRATION_SETTINGS,
	normalizeRegistrationSettings,
	type RegistrationSettings,
	type SignUpMethod,
} from "./signup-gate.rules";

export const REGISTRATION_SETTINGS_KEY = "registration";

export async function getRegistrationSettings(): Promise<RegistrationSettings> {
	const [row] = await db
		.select({ value: appSettings.value })
		.from(appSettings)
		.where(eq(appSettings.key, REGISTRATION_SETTINGS_KEY))
		.limit(1);
	return normalizeRegistrationSettings(row?.value);
}
