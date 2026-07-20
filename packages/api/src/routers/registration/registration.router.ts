import {
	getRegistrationSettings,
	REGISTRATION_SETTINGS_KEY,
} from "@nanahoshi-v2/auth/registration-settings";
import { env } from "@nanahoshi-v2/env/server";
import { BadRequestError } from "../../errors";
import { adminProcedure } from "../../index";
import { settingsRepository } from "../settings/settings.repository";
import { UpdateRegistrationInput } from "./registration.model";

/** Instance-wide registration policy — app-owner only. */
export const registrationRouter = {
	get: adminProcedure.handler(async () => {
		return await getRegistrationSettings();
	}),

	update: adminProcedure
		.input(UpdateRegistrationInput)
		.handler(async ({ input }) => {
			// A method only counts as available if the deployment can actually
			// offer it — Discord sign-up needs OAuth credentials in the env.
			const discordUsable =
				input.methods.discord &&
				!!env.DISCORD_CLIENT_ID &&
				!!env.DISCORD_CLIENT_SECRET;
			if (
				input.policy === "invite-only" &&
				!input.methods.email &&
				!discordUsable
			) {
				throw new BadRequestError(
					"At least one usable sign-up method must remain enabled while registration is invite-only.",
				);
			}
			await settingsRepository.upsert(REGISTRATION_SETTINGS_KEY, input);
			return input;
		}),
};
