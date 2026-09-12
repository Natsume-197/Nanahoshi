import { z } from "zod";

export const BackupConfigSchema = z.object({
	frequency: z.enum(["disabled", "daily", "weekly"]).default("disabled"),
	hour: z.number().int().min(0).max(23).default(3),
	retention: z.number().int().min(1).max(100).default(7),
});
export type BackupConfig = z.infer<typeof BackupConfigSchema>;
export const BackupFilenameSchema = z
	.string()
	.regex(/^nanahoshi-[\dT-]+-[a-f0-9-]{36}\.dump$/);
export function backupPattern(config: BackupConfig) {
	return config.frequency === "disabled"
		? null
		: `0 ${config.hour} * * ${config.frequency === "weekly" ? "0" : "*"}`;
}
