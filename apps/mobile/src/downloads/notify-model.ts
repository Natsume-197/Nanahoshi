import type { DownloadJob } from "./model";

/** One run of downloads, from the first queued to the queue running dry. */
export type Batch = {
	active: Readonly<Record<string, DownloadJob>>;
	done: string[];
	failed: string[];
	/** Something in the run was asked for by hand (not only smart downloads). */
	manual: boolean;
};

export const EMPTY_BATCH: Batch = {
	active: {},
	done: [],
	failed: [],
	manual: false,
};

export type NotifyView =
	| {
			type: "progress";
			uuid: string;
			progress: number;
			size: DownloadJob["size"];
			queued: number;
	  }
	| { type: "finished"; done: string[]; failed: string[]; quiet: boolean }
	| { type: "hide" };

const isActive = (job: DownloadJob) =>
	job.status === "queued" || job.status === "downloading";

/**
 * What the download notification should say after the queue changed. A job
 * that left the queue counts as done when its title is complete on disk,
 * failed when the manager marked it so, and is forgotten when cancelled.
 * A run only smart downloads made ends quietly. `view` is null when nothing
 * the notification shows changed.
 */
export function stepBatch(
	batch: Batch,
	jobs: Readonly<Record<string, DownloadJob>>,
	{
		completed,
		manual,
	}: {
		completed: (uuid: string, job: DownloadJob) => boolean;
		manual: (uuid: string) => boolean;
	},
): { batch: Batch; view: NotifyView | null } {
	const done = [...batch.done];
	const failed = [...batch.failed];
	for (const [uuid, job] of Object.entries(batch.active)) {
		const now = jobs[uuid];
		if (now && isActive(now)) continue;
		if (now?.status === "failed") failed.push(uuid);
		else if (completed(uuid, job)) done.push(uuid);
	}
	const active = Object.fromEntries(
		Object.entries(jobs).filter(([, job]) => isActive(job)),
	);
	const uuids = Object.keys(active);
	const wasManual =
		batch.manual || uuids.some((uuid) => !batch.active[uuid] && manual(uuid));
	if (uuids.length > 0) {
		const current =
			uuids.find((uuid) => active[uuid].status === "downloading") ?? uuids[0];
		return {
			batch: { active, done, failed, manual: wasManual },
			view: {
				type: "progress",
				uuid: current,
				progress: active[current].progress,
				size: active[current].size,
				queued: uuids.length - 1,
			},
		};
	}
	if (Object.keys(batch.active).length === 0) return { batch, view: null };
	return {
		batch: EMPTY_BATCH,
		view:
			done.length > 0 || failed.length > 0
				? { type: "finished", done, failed, quiet: !wasManual }
				: { type: "hide" },
	};
}

/** "120 of 394 MB" style amounts, in MB below a gigabyte. */
export function formatSize(bytes: number, locale: string): string {
	const gb = bytes / 1024 ** 3;
	const format = (value: number, digits: number) =>
		value.toLocaleString(locale, { maximumFractionDigits: digits });
	return gb >= 1 ? `${format(gb, 1)} GB` : `${format(bytes / 1024 ** 2, 0)} MB`;
}
