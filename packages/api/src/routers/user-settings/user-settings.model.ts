import { z } from "zod";

/** Closed key set so the table doesn't become an arbitrary junk drawer. */
export const UserSettingsKey = z.enum([
	"reader-profiles",
	"reader-custom-themes",
]);

export const GetUserSettingInput = z.object({
	key: UserSettingsKey,
});

export const SetUserSettingInput = z.object({
	key: UserSettingsKey,
	value: z.unknown(),
});
