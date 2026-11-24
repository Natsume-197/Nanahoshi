import { settingsRepository } from "../settings/settings.repository";
import {
	INSTANCE_RELEASE_KEY,
	type InstanceRelease,
	InstanceReleaseSchema,
	UPDATE_CHECK_KEY,
	UPDATE_PREFERENCES_KEY,
	UPDATE_SCHEDULE_KEY,
	type UpdateCheck,
	UpdateCheckSchema,
	type UpdatePreferences,
	UpdatePreferencesSchema,
	type UpdateSchedule,
	UpdateScheduleSchema,
} from "./update.model";

/** Update state kept in `app_settings`, parsed with defaults on every read. */
export class UpdateRepository {
	async getCheck(): Promise<UpdateCheck> {
		const parsed = UpdateCheckSchema.safeParse(
			(await settingsRepository.getValue(UPDATE_CHECK_KEY)) ?? {},
		);
		return parsed.success ? parsed.data : UpdateCheckSchema.parse({});
	}

	async saveCheck(check: UpdateCheck) {
		await settingsRepository.upsert(UPDATE_CHECK_KEY, check);
	}

	async getPreferences(): Promise<UpdatePreferences> {
		const parsed = UpdatePreferencesSchema.safeParse(
			(await settingsRepository.getValue(UPDATE_PREFERENCES_KEY)) ?? {},
		);
		return parsed.success ? parsed.data : UpdatePreferencesSchema.parse({});
	}

	async savePreferences(preferences: UpdatePreferences) {
		await settingsRepository.upsert(UPDATE_PREFERENCES_KEY, preferences);
	}

	async getSchedule(): Promise<UpdateSchedule | null> {
		const value = await settingsRepository.getValue(UPDATE_SCHEDULE_KEY);
		const parsed = UpdateScheduleSchema.safeParse(value);
		return parsed.success ? parsed.data : null;
	}

	async saveSchedule(schedule: UpdateSchedule | null) {
		// The column is NOT NULL and Drizzle sends a JS null as SQL NULL, so "no
		// schedule" is stored as an empty object, which getSchedule reads as null.
		await settingsRepository.upsert(UPDATE_SCHEDULE_KEY, schedule ?? {});
	}

	async getInstanceRelease(): Promise<InstanceRelease | null> {
		const parsed = InstanceReleaseSchema.safeParse(
			await settingsRepository.getValue(INSTANCE_RELEASE_KEY),
		);
		return parsed.success ? parsed.data : null;
	}

	async saveInstanceRelease(value: InstanceRelease) {
		await settingsRepository.upsert(INSTANCE_RELEASE_KEY, value);
	}
}

export const updateRepository = new UpdateRepository();
