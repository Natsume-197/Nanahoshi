import { ANNOUNCEMENT_SEVERITIES } from "@nanahoshi/db/schema/general";
import { z } from "zod";

export const AnnouncementSeverity = z.enum(ANNOUNCEMENT_SEVERITIES);

const isoDateTime = z.iso.datetime({ offset: true });

export const AnnouncementFields = z
	.object({
		severity: AnnouncementSeverity,
		title: z.string().trim().min(1).max(120),
		body: z.string().trim().max(2_000).nullable(),
		dismissible: z.boolean(),
		startsAt: isoDateTime.nullable(),
		endsAt: isoDateTime.nullable(),
	})
	.refine(
		(v) =>
			!v.startsAt || !v.endsAt || Date.parse(v.endsAt) > Date.parse(v.startsAt),
		{ message: "endsAt must be after startsAt", path: ["endsAt"] },
	);
export type AnnouncementFields = z.infer<typeof AnnouncementFields>;

export const CreateAnnouncementInput = AnnouncementFields;

export const UpdateAnnouncementInput = z.object({
	id: z.uuid(),
	fields: AnnouncementFields,
});

export const AnnouncementIdInput = z.object({ id: z.uuid() });
