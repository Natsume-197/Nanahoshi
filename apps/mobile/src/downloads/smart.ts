import type { DownloadEntry, DownloadKind, DownloadReason } from "./model";

/** A finished title stays this long before smart downloads clear it. */
export const FINISHED_GRACE_MS = 7 * 24 * 60 * 60_000;
/** Past this share of a title, the next volume of its series comes down. */
export const NEXT_VOLUME_AT = 0.8;
/** How many of "want to read" / "want to listen" stay on the phone. */
export const WANT_LIMIT = 3;
/** Never fill the phone: a download needs this much room left after it. */
export const MIN_FREE_BYTES = 1024 ** 3;

/** Downloads from before smart downloads were all the user's own. */
export function reasonsOf(entry: Pick<DownloadEntry, "reasons">) {
	return entry.reasons ?? [{ type: "manual" as const }];
}

export function reasonKey(reason: DownloadReason): string {
	return reason.type === "collection" ? `collection:${reason.id}` : reason.type;
}

/** The source a reason comes from: what has to load before it can be judged. */
function sourceOf(reason: DownloadReason): string | null {
	if (reason.type === "reading" || reason.type === "want") return reason.type;
	if (reason.type === "collection") return reasonKey(reason);
	return null;
}

/** A title one of the sources (shelves, offline collections) wants here. */
export type WantedTitle = {
	kind: DownloadKind;
	uuid: string;
	reason: DownloadReason;
};

export type SmartEntry = Pick<
	DownloadEntry,
	"kind" | "uuid" | "reasons" | "finishedAt" | "complete"
>;

export type SyncPlan = {
	download: { kind: DownloadKind; uuid: string; reasons: DownloadReason[] }[];
	update: { kind: DownloadKind; uuid: string; reasons: DownloadReason[] }[];
	remove: { kind: DownloadKind; uuid: string }[];
};

/**
 * Brings the phone in line with the sources. `loaded` names the sources that
 * answered: a reason from one that didn't is kept, so a failed request never
 * deletes anything. Titles still downloading (`busy`) are left alone. With
 * `clearFinished` off (smart downloads turned off) nothing is cleared for
 * having been finished.
 */
export function planSync({
	entries,
	wanted,
	loaded,
	busy,
	now,
	clearFinished = true,
}: {
	entries: SmartEntry[];
	wanted: WantedTitle[];
	loaded: ReadonlySet<string>;
	busy: ReadonlySet<string>;
	now: number;
	clearFinished?: boolean;
}): SyncPlan {
	const finishedLongAgo = (entry: SmartEntry) =>
		clearFinished &&
		!!entry.finishedAt &&
		now - entry.finishedAt >= FINISHED_GRACE_MS;
	const inGrace = (entry: SmartEntry) =>
		!!entry.finishedAt && !finishedLongAgo(entry);
	const plan: SyncPlan = { download: [], update: [], remove: [] };
	const wantedByUuid = new Map<
		string,
		{ kind: DownloadKind; reasons: DownloadReason[] }
	>();
	for (const title of wanted) {
		const current = wantedByUuid.get(title.uuid);
		if (!current)
			wantedByUuid.set(title.uuid, {
				kind: title.kind,
				reasons: [title.reason],
			});
		else if (
			!current.reasons.some((r) => reasonKey(r) === reasonKey(title.reason))
		)
			current.reasons.push(title.reason);
	}

	const onPhone = new Set<string>();
	for (const entry of entries) {
		onPhone.add(entry.uuid);
		if (busy.has(entry.uuid)) continue;
		const wantedHere = wantedByUuid.get(entry.uuid)?.reasons ?? [];
		const wantedKeys = new Set(wantedHere.map(reasonKey));
		const before = reasonsOf(entry);
		const kept = before.filter((reason) => {
			if (reason.type === "manual") return true;
			// Series and shelves let go of a title finished a while ago.
			if (reason.type !== "collection" && finishedLongAgo(entry)) return false;
			if (reason.type === "series") return true;
			const source = sourceOf(reason) as string;
			return !loaded.has(source) || wantedKeys.has(reasonKey(reason));
		});
		const keptKeys = new Set(kept.map(reasonKey));
		const added = wantedHere.filter(
			(reason) =>
				!keptKeys.has(reasonKey(reason)) &&
				// A finished title doesn't come back for a shelf it's still on.
				!(reason.type !== "collection" && finishedLongAgo(entry)),
		);
		const next = [...kept, ...added];
		if (next.length === 0 && !inGrace(entry)) {
			plan.remove.push({ kind: entry.kind, uuid: entry.uuid });
			continue;
		}
		const changed =
			entry.reasons === undefined ||
			next.length !== before.length ||
			next.some(
				(reason, index) => reasonKey(reason) !== reasonKey(before[index]),
			);
		if (changed)
			plan.update.push({ kind: entry.kind, uuid: entry.uuid, reasons: next });
		// Cut off (app closed mid-download): smart downloads pick it back up.
		if (!entry.complete && next.some((reason) => reason.type !== "manual"))
			plan.download.push({ kind: entry.kind, uuid: entry.uuid, reasons: next });
	}

	for (const [uuid, title] of wantedByUuid) {
		if (onPhone.has(uuid) || busy.has(uuid)) continue;
		plan.download.push({ kind: title.kind, uuid, reasons: title.reasons });
	}
	return plan;
}

/** How far into a title a progress save puts the reader, 0–1, or null when
 * the save doesn't say. */
export function progressFraction(
	path: readonly string[],
	input: Record<string, unknown>,
): number | null {
	if (input.status === "completed") return 1;
	const [done, total] =
		path[0] === "readingProgress"
			? [input.exploredCharCount, input.bookCharCount]
			: [input.currentTimeSeconds, input.durationSeconds];
	if (typeof done !== "number" || typeof total !== "number" || total <= 0)
		return null;
	return Math.min(1, done / total);
}

/** The volume after `uuid`, by series position (unnumbered ones last, in the
 * server's order). */
export function nextInSeries(
	volumes: { uuid: string; position: number | null }[],
	uuid: string,
): string | null {
	const ordered = volumes
		.map((volume, index) => ({ ...volume, index }))
		.sort(
			(a, b) =>
				(a.position ?? Number.POSITIVE_INFINITY) -
					(b.position ?? Number.POSITIVE_INFINITY) || a.index - b.index,
		);
	const at = ordered.findIndex((volume) => volume.uuid === uuid);
	return at >= 0 ? (ordered[at + 1]?.uuid ?? null) : null;
}

/** "Keep": the title becomes the user's own and never leaves by itself. */
export function keepForever(entry: SmartEntry): DownloadReason[] {
	const reasons = reasonsOf(entry);
	return reasons.some((reason) => reason.type === "manual")
		? reasons
		: [{ type: "manual" }, ...reasons];
}

/** Days until a finished title clears, or null when nothing will clear it. */
export function daysUntilCleared(
	entry: SmartEntry,
	now: number,
): number | null {
	const reasons = reasonsOf(entry);
	if (!entry.finishedAt) return null;
	if (reasons.some((r) => r.type === "manual" || r.type === "collection"))
		return null;
	const left = entry.finishedAt + FINISHED_GRACE_MS - now;
	return Math.max(0, Math.ceil(left / (24 * 60 * 60_000)));
}

/** What brought a title that smart downloads manage, for its label; null
 * for the user's own downloads. */
export function smartOrigin(entry: SmartEntry): DownloadReason | null {
	const reasons = reasonsOf(entry);
	if (reasons.some((reason) => reason.type === "manual")) return null;
	return (
		reasons.find((reason) => reason.type === "collection") ?? reasons[0] ?? null
	);
}

/** Opening the app or a network change resyncs at most this often. */
export const AMBIENT_SYNC_MS = 15 * 60_000;

/**
 * Whether a trigger that says nothing new (back to the app, a network change,
 * back online) is worth reloading the shelves and offline collections for:
 * only in the foreground, and not again within a quarter hour of a sync that
 * reached the server. A sync that ran offline is retried at once.
 */
export function ambientSyncDue({
	now,
	lastSyncAt,
	lastSyncOnline,
	foreground,
}: {
	now: number;
	lastSyncAt: number | null;
	lastSyncOnline: boolean;
	foreground: boolean;
}): boolean {
	if (!foreground) return false;
	if (lastSyncAt === null || !lastSyncOnline) return true;
	return now - lastSyncAt >= AMBIENT_SYNC_MS;
}
