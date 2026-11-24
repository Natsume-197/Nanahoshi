import { z } from "zod";
import {
	UpdaterOperationSchema,
	UpdaterPhaseSchema,
} from "../../modules/updates/protocol";
import { ReleaseSchema } from "../../modules/updates/release-feed";

// ---------- Stored values (app_settings) ----------

export const UPDATE_CHECK_KEY = "update-check";
export const UPDATE_PREFERENCES_KEY = "update-preferences";
export const UPDATE_SCHEDULE_KEY = "update-schedule";
export const INSTANCE_RELEASE_KEY = "instance-release";

export const UpdateCheckSchema = z.object({
	checkedAt: z.string().nullable().default(null),
	/** The last check's failure, safe to show; null after a success. */
	error: z.string().nullable().default(null),
	latest: ReleaseSchema.nullable().default(null),
	/** Releases newer than the running one, newest first. */
	newer: z.array(ReleaseSchema).default([]),
});
export type UpdateCheck = z.infer<typeof UpdateCheckSchema>;

export const UpdatePreferencesSchema = z.object({
	/** Pull a new release's image in the background as soon as it is out. */
	autoDownload: z.boolean().default(true),
	/** Install a downloaded release by itself the next time nobody is busy. */
	autoInstall: z.boolean().default(false),
});
export type UpdatePreferences = z.infer<typeof UpdatePreferencesSchema>;

export const UpdateScheduleSchema = z.object({
	mode: z.enum(["now", "idle"]),
	/** null when automatic updates scheduled it. */
	requestedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
	requestedAt: z.string(),
	targetVersion: z.string().nullable(),
	/** When the install request reached the updater; it can't be cancelled after. */
	sentAt: z.string().nullable(),
});
export type UpdateSchedule = z.infer<typeof UpdateScheduleSchema>;

export const InstanceReleaseSchema = z.object({
	/** The highest release this database has run. */
	release: z.string(),
	/** The release it ran before `release`, for "updated from" notices. */
	previous: z.string().nullable(),
	updatedAt: z.string(),
});
export type InstanceRelease = z.infer<typeof InstanceReleaseSchema>;

// ---------- Procedure inputs ----------

export const InstallUpdateInput = z.object({
	when: z.enum(["now", "idle"]),
});

export const UpdatePreferencesInput = UpdatePreferencesSchema.partial();

// ---------- Procedure outputs ----------

export const IdleReasonSchema = z.enum(["tasks", "listening", "backup"]);
export type IdleReason = z.infer<typeof IdleReasonSchema>;

export const InstallBlockSchema = z.enum([
	"development",
	"no-update",
	"updater-absent",
	"updater-stale",
	"updater-incompatible",
	"updater-problem",
	"pinned",
	"busy",
]);
export type InstallBlock = z.infer<typeof InstallBlockSchema>;

export const UpdaterViewSchema = z.object({
	state: z.enum(["absent", "stale", "incompatible", "connected"]),
	problem: z.string().nullable(),
	image: z.string().nullable(),
	pinned: z.boolean(),
	phase: UpdaterPhaseSchema,
	progress: z
		.object({ completedBytes: z.number(), totalBytes: z.number() })
		.nullable(),
	stagedVersion: z.string().nullable(),
	lastOperation: UpdaterOperationSchema.nullable(),
});
export type UpdaterView = z.infer<typeof UpdaterViewSchema>;

export const UpdateStatusSchema = z.object({
	release: z.string(),
	development: z.boolean(),
	checkEnabled: z.boolean(),
	repository: z.string(),
	check: UpdateCheckSchema,
	preferences: UpdatePreferencesSchema,
	schedule: UpdateScheduleSchema.nullable(),
	updater: UpdaterViewSchema,
	/** The newest release when it is newer than the running one. */
	available: ReleaseSchema.nullable(),
	/** Null when Install works now; otherwise the first thing in the way. */
	installBlock: InstallBlockSchema.nullable(),
	busy: z.array(IdleReasonSchema),
});
export type UpdateStatus = z.infer<typeof UpdateStatusSchema>;

/** What every signed-in person may know: the release, and a planned restart. */
export const UpdateNoticeSchema = z.object({
	release: z.string(),
	schedule: z
		.object({
			mode: z.enum(["now", "idle"]),
			requestedByName: z.string().nullable(),
			requestedAt: z.string(),
			installing: z.boolean(),
		})
		.nullable(),
	/** For admins: a newer release is out (drives the sidebar notice). */
	available: z.string().nullable(),
});
export type UpdateNotice = z.infer<typeof UpdateNoticeSchema>;
