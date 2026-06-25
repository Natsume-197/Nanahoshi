import { randomBytes } from "node:crypto";
import { NotFoundError } from "../../errors";
import { requirePermission } from "../../index";
import {
	CreateDiscordRuleInput,
	DeleteDiscordRuleInput,
	ToggleDiscordRuleInput,
} from "./discord-rules.model";
import { discordRulesRepository } from "./discord-rules.repository";

function generateId() {
	return randomBytes(12).toString("hex");
}

export const discordRulesRouter = {
	list: requirePermission("settings", "read").handler(async ({ context }) => {
		return await discordRulesRepository.listByOrg(context.serverId);
	}),

	create: requirePermission("settings", "update")
		.input(CreateDiscordRuleInput)
		.handler(async ({ input, context }) => {
			return await discordRulesRepository.create({
				id: generateId(),
				serverId: context.serverId,
				guildId: input.guildId,
				roleId: input.roleId ?? null,
				label: input.label ?? null,
				enabled: true,
			});
		}),

	delete: requirePermission("settings", "update")
		.input(DeleteDiscordRuleInput)
		.handler(async ({ input, context }) => {
			const deleted = await discordRulesRepository.deleteByIdAndOrg(
				input.id,
				context.serverId,
			);
			if (!deleted) {
				throw new NotFoundError("Rule not found");
			}
			return { success: true };
		}),

	toggle: requirePermission("settings", "update")
		.input(ToggleDiscordRuleInput)
		.handler(async ({ input, context }) => {
			const updated = await discordRulesRepository.setEnabled(
				input.id,
				context.serverId,
				input.enabled,
			);
			if (!updated) {
				throw new NotFoundError("Rule not found");
			}
			return updated;
		}),
};
