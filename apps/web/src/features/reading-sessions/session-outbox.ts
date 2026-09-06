import {
	ReadingSegmentInput,
	type SessionUpload,
	SyncReadingSessionInput,
} from "@nanahoshi-v2/api/routers/reading-sessions/reading-sessions.model";
import { z } from "zod";

const StoredSession = SyncReadingSessionInput.extend({
	segments: z.array(ReadingSegmentInput),
	ownerId: z.string().optional(),
	acknowledgedRevision: z.number().optional(),
	lastObservedAt: z.iso.datetime().optional(),
	failure: z.object({ message: z.string(), terminal: z.boolean() }).optional(),
});
const prefix = "nanahoshi:reading-outbox:";
export const sessionOwnerLock = (userId: string, ownerId: string) =>
	`nanahoshi-reading-lifecycle:${userId}:${ownerId}`;
export function persistSession(
	userId: string,
	session: SessionUpload,
	ownerId?: string,
) {
	const key = `${prefix}${userId}:${session.id}`;
	const raw = localStorage.getItem(key);
	const previous = raw ? StoredSession.parse(JSON.parse(raw)) : undefined;
	localStorage.setItem(
		key,
		JSON.stringify({
			...previous,
			...session,
			ownerId: ownerId ?? previous?.ownerId,
			lastObservedAt:
				session.segments.at(-1)?.endedAt ??
				previous?.lastObservedAt ??
				session.startedAt,
		}),
	);
}
export function pendingSessions(userId: string, includeAcknowledged = false) {
	const rows: z.infer<typeof StoredSession>[] = [];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (!key?.startsWith(`${prefix}${userId}:`)) continue;
		try {
			const parsed = StoredSession.safeParse(
				JSON.parse(localStorage.getItem(key) ?? "null"),
			);
			if (
				parsed.success &&
				(includeAcknowledged ||
					parsed.data.acknowledgedRevision !== parsed.data.revision ||
					parsed.data.segments.length > 0)
			)
				rows.push(parsed.data);
		} catch {
			/* Keep damaged records; do not silently erase personal history. */
		}
	}
	return rows;
}
export function acknowledgeSession(
	userId: string,
	sent: SessionUpload,
	runId: string,
) {
	const key = `${prefix}${userId}:${sent.id}`;
	const raw = localStorage.getItem(key);
	if (!raw) return;
	const current = StoredSession.parse(JSON.parse(raw));
	const acknowledged = new Set(sent.segments.map((s) => s.id));
	const segments = current.segments.filter((s) => !acknowledged.has(s.id));
	if (
		current.state === "finished" &&
		current.revision === sent.revision &&
		!segments.length
	)
		localStorage.removeItem(key);
	else
		localStorage.setItem(
			key,
			JSON.stringify({
				...current,
				revision: segments.length
					? Math.max(current.revision, sent.revision + 1)
					: current.revision,
				acknowledgedRevision: sent.revision,
				failure: undefined,
				runId,
				segments,
			}),
		);
}

/** Includes damaged records so they remain visible and can be exported for repair. */
export function sessionOutboxIssues(userId: string) {
	const issues: {
		id: string;
		message: string;
		terminal: boolean;
		raw: string;
	}[] = [];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (!key?.startsWith(`${prefix}${userId}:`)) continue;
		const raw = localStorage.getItem(key) ?? "";
		try {
			const row = StoredSession.parse(JSON.parse(raw));
			if (row.failure) issues.push({ id: row.id, ...row.failure, raw });
		} catch {
			issues.push({
				id: key.slice(`${prefix}${userId}:`.length),
				message: "Stored reading history could not be read.",
				terminal: true,
				raw,
			});
		}
	}
	return issues;
}

export async function syncSessionOutbox({
	userId,
	ownerId,
	upload,
	acknowledged,
	retry = false,
	locks = navigator.locks,
}: {
	userId: string;
	ownerId: string;
	upload: (session: SessionUpload) => Promise<{ runId: string }>;
	acknowledged?: (session: SessionUpload, runId: string) => void;
	retry?: boolean;
	locks?: LockManager;
}) {
	let sentAny = false;
	let storageError: unknown;
	for (const queued of pendingSessions(userId, true)) {
		if (queued.failure?.terminal && !retry) continue;
		const send = async (orphan: boolean) => {
			try {
				// Earlier uploads may have awaited the network while this tab kept recording.
				const raw = localStorage.getItem(`${prefix}${userId}:${queued.id}`);
				if (!raw) return;
				Object.assign(queued, StoredSession.parse(JSON.parse(raw)));
				if (orphan && queued.state !== "finished") {
					queued.state = "finished";
					queued.endedAt = queued.lastObservedAt ?? queued.startedAt;
					queued.revision += 1;
					persistSession(userId, queued);
				}
				if (
					queued.acknowledgedRevision === queued.revision &&
					!queued.segments.length
				)
					return;
				// Strip local lifecycle/failure metadata from the wire payload.
				const sent = SyncReadingSessionInput.parse({
					...queued,
					segments: queued.segments.slice(0, 200),
				});
				const result = await upload(sent);
				acknowledgeSession(userId, sent, result.runId);
				acknowledged?.(sent, result.runId);
				sentAny = true;
			} catch (error) {
				const status = (error as { status?: number } | null)?.status;
				const failure = {
					message:
						error instanceof Error
							? error.message
							: "Reading history upload failed.",
					terminal:
						typeof status === "number" &&
						status >= 400 &&
						status < 500 &&
						![401, 408, 429].includes(status),
				};
				const key = `${prefix}${userId}:${queued.id}`;
				const raw = localStorage.getItem(key);
				if (raw)
					localStorage.setItem(
						key,
						JSON.stringify({ ...JSON.parse(raw), failure }),
					);
			}
		};
		try {
			if (queued.ownerId === ownerId) await send(false);
			else if (locks) {
				// A hidden tab retains its lifetime lock even after yielding recording ownership.
				await locks.request(
					sessionOwnerLock(userId, queued.ownerId ?? queued.id),
					{ ifAvailable: true },
					async (lock) => {
						if (lock) await send(true);
					},
				);
			}
		} catch (error) {
			// Storage/lock failures on one entry must not starve later history.
			// The unacknowledged record is retained and remains pending for retry.
			storageError = error;
		}
	}
	if (storageError) throw storageError;
	return sentAny;
}
