import { requirePermission } from "../../index";
import { settingsRepository } from "../settings/settings.repository";
import { type AccessMode, SetAccessModeInput } from "./server-access.model";

const DEFAULT_MODE: AccessMode = "invite_only";
const keyFor = (serverId: string) => `access_mode:${serverId}`;

export const serverAccessRouter = {
	getMode: requirePermission("settings", "read").handler(
		async ({ context }) => {
			const mode = await settingsRepository.getValue<AccessMode>(
				keyFor(context.serverId),
			);
			return { mode: mode ?? DEFAULT_MODE };
		},
	),

	setMode: requirePermission("settings", "update")
		.input(SetAccessModeInput)
		.handler(async ({ input, context }) => {
			await settingsRepository.upsert(keyFor(context.serverId), input.mode);
			return { mode: input.mode };
		}),
};
