import { BadRequestError, ConflictError } from "../../errors";
import { protectedProcedure } from "../../index";
import {
	GetUserSettingInput,
	SetUserSettingInput,
} from "./user-settings.model";
import { userSettingsRepository } from "./user-settings.repository";

/** The value is a client-owned blob; cap its size as a cheap abuse guard. */
const MAX_VALUE_BYTES = 128 * 1024;

export const userSettingsRouter = {
	get: protectedProcedure
		.input(GetUserSettingInput)
		.handler(async ({ input, context }) => {
			return userSettingsRepository.get(context.session.user.id, input.key);
		}),

	set: protectedProcedure
		.input(SetUserSettingInput)
		.handler(async ({ input, context }) => {
			if (JSON.stringify(input.value ?? null).length > MAX_VALUE_BYTES) {
				throw new BadRequestError("Setting value too large");
			}
			const result = await userSettingsRepository.upsert(
				context.session.user.id,
				input.key,
				input.value ?? null,
				input.expectedUpdatedAt === undefined
					? undefined
					: input.expectedUpdatedAt === null
						? null
						: new Date(input.expectedUpdatedAt),
			);
			if (!result) {
				throw new ConflictError("User setting changed on another device");
			}
			return result;
		}),
};
