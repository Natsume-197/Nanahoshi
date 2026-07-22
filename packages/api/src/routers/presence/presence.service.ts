import * as presence from "../../modules/presence/presenceManager";
import { presenceRepository } from "./presence.repository";

export const setStatus = async (
	userId: string,
	status: presence.ManualPresenceStatus,
) => {
	await presenceRepository.setStatus(userId, status);
	await presence.setManualStatus(userId, status);
};

export const clearActivity = (userId: string) => presence.clearActivity(userId);

export const setIdle = (userId: string, idle: boolean) =>
	presence.setIdle(userId, idle);
