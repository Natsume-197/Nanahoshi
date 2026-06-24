import { z } from "zod";

export const CreateDiscordRuleInput = z.object({
	guildId: z.string().min(1, "Guild ID is required"),
	roleId: z.string().optional(),
	label: z.string().optional(),
});

export const DeleteDiscordRuleInput = z.object({ id: z.string() });

export const ToggleDiscordRuleInput = z.object({
	id: z.string(),
	enabled: z.boolean(),
});
