import { markReadListenActivity as markSynchronizedActivity } from "../../modules/presence/presence.service";
import * as presence from "../../modules/presence/presenceManager";
import { presenceRepository } from "./presence.repository";

export const setStatus = async (
	userId: string,
	status: presence.ManualPresenceStatus,
) => {
	await presenceRepository.setStatus(userId, status);
	await presence.setManualStatus(userId, status);
};

export const clearActivity = (userId: string, sessionId: string) =>
	presence.clearActivity(userId, sessionId);

export const markReadListenActivity = (
	userId: string,
	sessionId: string,
	book: presence.PresenceBook,
) => markSynchronizedActivity(userId, sessionId, book);

export const setIdle = (userId: string, idle: boolean) =>
	presence.setIdle(userId, idle);
