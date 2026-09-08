import { z } from "zod";
import { BadRequestError } from "../../errors";

const position = z.number().min(0).max(1).nullable();
const timeZone = z
	.string()
	.max(100)
	.refine((v) => {
		try {
			new Intl.DateTimeFormat("en", { timeZone: v });
			return true;
		} catch {
			return false;
		}
	}, "Invalid time zone");
export const ReadingBookInput = z.object({ bookUuid: z.string().min(1) });
export const ReadingPreferencesInput = z.object({
	mode: z.enum(["automatic", "manual", "off"]),
	idleMinutes: z.number().int().min(2).max(30),
});
export const ReadingSegmentInput = z
	.object({
		id: z.uuid(),
		startedAt: z.iso.datetime(),
		endedAt: z.iso.datetime(),
		seconds: z.number().min(0).max(86400),
		startPosition: position,
		endPosition: position,
		startLocator: z.string().max(2000).nullable().optional(),
		endLocator: z.string().max(2000).nullable().optional(),
		kind: z.enum(["reading", "jump", "manual"]),
	})
	.refine(
		(v) =>
			Date.parse(v.endedAt) >= Date.parse(v.startedAt) &&
			Date.parse(v.endedAt) - Date.parse(v.startedAt) <= 86400_000 &&
			v.seconds <= (Date.parse(v.endedAt) - Date.parse(v.startedAt)) / 1000 + 1,
		"Invalid duration",
	);
export const SyncReadingSessionInput = ReadingBookInput.extend({
	id: z.uuid(),
	runId: z.uuid().nullable(),
	startedAt: z.iso.datetime(),
	endedAt: z.iso.datetime().nullable(),
	state: z.enum(["active", "paused", "finished"]),
	revision: z.number().int().min(1),
	mode: z.enum(["automatic", "manual", "retrospective"]),
	source: z.enum(["web", "native", "koreader", "kobo", "manual"]),
	device: z.string().max(100),
	installationId: z.uuid(),
	contentVersion: z.string().min(1).max(200),
	timeZone,
	segments: z.array(ReadingSegmentInput).max(200),
});
export type SessionUpload = z.infer<typeof SyncReadingSessionInput>;
export function validateSession(
	input: Pick<SessionUpload, "startedAt" | "endedAt" | "state" | "mode"> & {
		segments: { startedAt: string; endedAt: string; kind: string }[];
	},
	now = Date.now(),
) {
	if (input.state === "finished" && !input.endedAt)
		throw new BadRequestError("Finished sessions require an end time");
	const start = Date.parse(input.startedAt);
	const end = input.endedAt ? Date.parse(input.endedAt) : now + 5000;
	if (
		!Number.isFinite(start) ||
		!Number.isFinite(end) ||
		start > now + 5000 ||
		end < start ||
		end > now + 5000
	)
		throw new BadRequestError("Invalid session dates");
	for (const s of input.segments) {
		if (
			Date.parse(s.startedAt) < start ||
			Date.parse(s.endedAt) > end ||
			(input.mode === "retrospective") !== (s.kind === "manual")
		)
			throw new BadRequestError("Invalid session segment");
	}
}
export const ReadingHistoryInput = ReadingBookInput.extend({
	runId: z.uuid().optional(),
	timeZone,
	// Select whole segments intersecting [from, to); omitted bounds retain full history.
	from: z.iso.datetime().optional(),
	to: z.iso.datetime().optional(),
}).refine(
	(v) => !v.from || !v.to || Date.parse(v.from) < Date.parse(v.to),
	"Invalid history dates",
);
export const ReadingSessionIdInput = ReadingBookInput.extend({ id: z.uuid() });
export const ReadingRunInput = ReadingBookInput.extend({
	id: z.uuid(),
	action: z.enum(["reread", "finish", "leave"]),
});
export const ReadingRunIdInput = ReadingBookInput.extend({ id: z.uuid() });
export const CorrectReadingSessionInput = ReadingSessionIdInput.extend({
	segment: ReadingSegmentInput,
});
