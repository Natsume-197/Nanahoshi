import { settingsRepository } from "../settings/settings.repository";
import { randomInstanceName } from "./instance-name";

export const INSTANCE_SETTINGS_KEY = "instance";

type InstanceSettings = { name: string };

/**
 * The instance's display name. The first read names it at random and stores
 * that, so every client sees the same name until the admin changes it.
 */
export async function getInstanceName(): Promise<string> {
	const stored = await settingsRepository.getValue<InstanceSettings>(
		INSTANCE_SETTINGS_KEY,
	);
	if (stored?.name) return stored.name;
	// Concurrent first reads race to insert; whoever wins names the instance.
	const settled = await settingsRepository.insertIfAbsent<InstanceSettings>(
		INSTANCE_SETTINGS_KEY,
		{ name: randomInstanceName() },
	);
	return settled.name;
}

export async function setInstanceName(name: string): Promise<string> {
	await settingsRepository.upsert(INSTANCE_SETTINGS_KEY, { name });
	return name;
}
