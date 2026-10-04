import type { ReaderBootBook } from "@nanahoshi/reader-bridge";
import type { QueryClient } from "@tanstack/react-query";
import type { Api } from "@/lib/api";
import type { NanahoshiAuth } from "@/lib/auth-client";
import { coverUrl } from "@/lib/covers";
import { titleOrUntitled } from "@/lib/format";
import { playerBookFrom } from "@/player/engine";
import { onConnectedServer } from "@/reader/server-url";
import {
	coverFile,
	downloadInto,
	ensureBookFile,
	freeSpace,
	hasFile,
	readEntry,
	readSmartState,
	removeDownload,
	saveAudiobookMeta,
	saveBookMeta,
	trackFile,
	writeEntry,
	writeSmartState,
} from "./files";
import {
	audioFileName,
	byteFraction,
	type DownloadEntry,
	type DownloadJob,
	type DownloadKind,
	type DownloadReason,
	weightedProgress,
} from "./model";
import { MIN_FREE_BYTES, reasonKey } from "./smart";

const MANUAL: DownloadReason[] = [{ type: "manual" }];

export type DownloadsSnapshot = {
	jobs: Readonly<Record<string, DownloadJob>>;
	/** Bumps whenever titles appear on or leave the disk. */
	version: number;
};

type Deps = {
	serverUrl: string;
	auth: NanahoshiAuth;
	api: Api;
	queryClient: QueryClient;
};

/** What the reader needs to open a book offline (the reader route saves the
 * same shape when it opens one). */
export function bootBookFrom(book: {
	title: string | null;
	filename: string | null;
	cover: string | null;
	filesizeKb: number | null;
	filehash: string | null;
	pageCount: number | null;
	languageCode: string | null;
	contentForm: ReaderBootBook["contentForm"];
}): ReaderBootBook {
	return {
		title: book.title,
		filename: book.filename,
		cover: book.cover,
		filesizeKb: book.filesizeKb,
		filehash: book.filehash,
		pageCount: book.pageCount,
		languageCode: book.languageCode,
		contentForm: book.contentForm,
	};
}

class Cancelled extends Error {}

const stopIfCancelled = (signal: AbortSignal) => {
	if (signal.aborted) throw new Cancelled();
};

/**
 * Keeps titles on the phone: one download at a time (a phone's link is the
 * bottleneck, and one finished title beats three half ones), progress for
 * the views, cancel, and audiobooks that resume file by file after a cut.
 * A tiny external store, like the player engine.
 */
export class DownloadManager {
	private snapshot: DownloadsSnapshot = { jobs: {}, version: 0 };
	private readonly listeners = new Set<() => void>();
	private readonly queue: string[] = [];
	private readonly aborts = new Map<string, AbortController>();
	/** Why each queued title was asked for, written into its entry. */
	private readonly reasons = new Map<string, DownloadReason[]>();
	private running = false;

	constructor(private readonly deps: Deps) {}

	/** The connection's auth client, for the active server id. */
	get auth() {
		return this.deps.auth;
	}

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};
	getSnapshot = () => this.snapshot;
	private emit(patch: Partial<DownloadsSnapshot>) {
		this.snapshot = { ...this.snapshot, ...patch };
		for (const listener of this.listeners) listener();
	}
	private setJob(uuid: string, job: DownloadJob | null) {
		const jobs = { ...this.snapshot.jobs };
		if (job) jobs[uuid] = job;
		else delete jobs[uuid];
		this.emit({ jobs });
	}
	private diskChanged() {
		this.emit({ version: this.snapshot.version + 1 });
	}

	download(
		kind: DownloadKind,
		uuid: string,
		serverId: string,
		reasons: DownloadReason[] = MANUAL,
	) {
		const current = this.snapshot.jobs[uuid];
		if (current && current.status !== "failed") return;
		// Asking for it again by hand lifts an earlier "don't bring it back".
		if (reasons.some((reason) => reason.type === "manual"))
			this.setDismissed(serverId, uuid, false);
		this.reasons.set(uuid, reasons);
		this.setJob(uuid, { kind, serverId, status: "queued", progress: 0 });
		this.queue.push(uuid);
		void this.drain();
	}

	/** Stops a download and throws away what it had fetched. */
	cancel(uuid: string) {
		const job = this.snapshot.jobs[uuid];
		const index = this.queue.indexOf(uuid);
		if (index >= 0) this.queue.splice(index, 1);
		this.aborts.get(uuid)?.abort();
		this.reasons.delete(uuid);
		this.setJob(uuid, null);
		if (job) {
			removeDownload(job.kind, job.serverId, uuid);
			this.diskChanged();
		}
	}

	/** Tries every failed download again, for the same reasons as before. */
	retryFailed() {
		for (const [uuid, job] of Object.entries(this.snapshot.jobs))
			if (job.status === "failed")
				this.download(job.kind, uuid, job.serverId, this.reasons.get(uuid));
	}

	/** Signing out: nothing keeps downloading for an account that left. */
	cancelAll() {
		for (const uuid of Object.keys(this.snapshot.jobs)) this.cancel(uuid);
	}

	/** `byUser`: smart downloads won't bring this title back on their own. */
	remove(
		kind: DownloadKind,
		serverId: string,
		uuid: string,
		{ byUser = true }: { byUser?: boolean } = {},
	) {
		if (this.snapshot.jobs[uuid]) this.cancel(uuid);
		removeDownload(kind, serverId, uuid);
		if (byUser) this.setDismissed(serverId, uuid, true);
		this.diskChanged();
	}

	/** Rewrites a title's entry (reasons, finish date) without touching files. */
	updateEntry(
		kind: DownloadKind,
		serverId: string,
		uuid: string,
		patch: Partial<
			Pick<DownloadEntry, "reasons" | "finishedAt" | "seriesUuid">
		>,
	) {
		const entry = readEntry(kind, serverId, uuid);
		if (!entry) return;
		writeEntry({ ...entry, ...patch });
		this.diskChanged();
	}

	/** Why a queued or running title was asked for. */
	pendingReasons(uuid: string): DownloadReason[] | null {
		return this.reasons.get(uuid) ?? null;
	}

	isDismissed(serverId: string, uuid: string) {
		return readSmartState(serverId).dismissed.includes(uuid);
	}

	private setDismissed(serverId: string, uuid: string, dismissed: boolean) {
		const state = readSmartState(serverId);
		const has = state.dismissed.includes(uuid);
		if (has === dismissed) return;
		writeSmartState(serverId, {
			...state,
			dismissed: dismissed
				? [...state.dismissed, uuid]
				: state.dismissed.filter((item) => item !== uuid),
		});
	}

	/** The reasons a fresh download writes, joined with any it had before. */
	private reasonsFor(uuid: string, previous: DownloadEntry | null) {
		const asked = this.reasons.get(uuid) ?? MANUAL;
		const before = previous?.reasons ?? [];
		const keys = new Set(before.map(reasonKey));
		return [
			...before,
			...asked.filter((reason) => !keys.has(reasonKey(reason))),
		];
	}

	/** Called by the reader after it fetched a book for the first time. */
	recordOpenedBook(serverId: string, uuid: string, book: ReaderBootBook) {
		if (readEntry("book", serverId, uuid)) return;
		writeEntry({
			kind: "book",
			uuid,
			serverId,
			title: titleOrUntitled(book.title),
			authors: [],
			cover: book.cover ?? null,
			color: null,
			complete: true,
			savedAt: Date.now(),
		});
		this.diskChanged();
	}

	private async drain() {
		if (this.running) return;
		this.running = true;
		try {
			for (let uuid = this.queue.shift(); uuid; uuid = this.queue.shift()) {
				const job = this.snapshot.jobs[uuid];
				if (!job) continue;
				const automatic = !(this.reasons.get(uuid) ?? MANUAL).some(
					(reason) => reason.type === "manual",
				);
				// Smart downloads never fill the phone; the next sync tries again.
				if (automatic && freeSpace() < MIN_FREE_BYTES) {
					this.reasons.delete(uuid);
					this.setJob(uuid, null);
					continue;
				}
				const abort = new AbortController();
				this.aborts.set(uuid, abort);
				this.setJob(uuid, { ...job, status: "downloading" });
				try {
					if (job.kind === "book")
						await this.fetchBook(uuid, job.serverId, abort.signal);
					else await this.fetchAudiobook(uuid, job.serverId, abort.signal);
					this.setJob(uuid, null);
				} catch (error) {
					if (!abort.signal.aborted && !(error instanceof Cancelled))
						this.setJob(uuid, { ...job, status: "failed" });
				} finally {
					this.aborts.delete(uuid);
					// A failed job keeps why it was asked for, for its retry.
					if (this.snapshot.jobs[uuid]?.status !== "failed")
						this.reasons.delete(uuid);
					this.diskChanged();
				}
			}
		} finally {
			this.running = false;
		}
	}

	/** Progress updates at 1% steps, not per network chunk. */
	private reporter(uuid: string) {
		let last = -1;
		return (progress: number, size?: { done: number; total: number }) => {
			const step = Math.floor(progress * 100);
			if (step === last) return;
			last = step;
			const job = this.snapshot.jobs[uuid];
			if (job) this.setJob(uuid, { ...job, progress: step / 100, size });
		};
	}

	private async headers() {
		const cookie = await this.deps.auth.getCookie();
		return cookie ? { Cookie: cookie } : undefined;
	}

	private async saveCover(
		kind: DownloadKind,
		serverId: string,
		uuid: string,
		cover: string | null,
		signal: AbortSignal,
	) {
		const url = coverUrl(this.deps.serverUrl, cover, 256);
		if (!url) return;
		// JPEG: the lock screen and older Androids don't all decode AVIF.
		await downloadInto(`${url}&format=jpeg`, coverFile(kind, serverId, uuid), {
			signal,
		}).catch(() => undefined);
	}

	private async fetchBook(uuid: string, serverId: string, signal: AbortSignal) {
		const { client, orpc } = this.deps.api;
		const [{ book }, details] = await Promise.all([
			client.books.getBookResolvingOrg({ uuid }),
			this.deps.queryClient
				.fetchQuery(
					orpc.books.getBookWithMetadata.queryOptions({ input: { uuid } }),
				)
				.catch(() => null),
		]);
		stopIfCancelled(signal);
		const meta = bootBookFrom(book);
		const previous = readEntry("book", serverId, uuid);
		const entry: DownloadEntry = {
			kind: "book",
			uuid,
			serverId,
			title: titleOrUntitled(book.title),
			authors: (details?.authors ?? []).map((author) => author.name),
			cover: book.cover ?? null,
			color: details?.mainColor ?? null,
			complete: false,
			savedAt: previous?.savedAt ?? Date.now(),
			reasons: this.reasonsFor(uuid, previous),
			finishedAt: previous?.finishedAt ?? null,
			seriesUuid: details
				? (details.series?.uuid ?? null)
				: previous?.seriesUuid,
		};
		writeEntry(entry);
		saveBookMeta(serverId, uuid, meta);
		this.diskChanged();
		await this.saveCover("book", serverId, uuid, entry.cover, signal);
		stopIfCancelled(signal);
		const report = this.reporter(uuid);
		await ensureBookFile({
			serverId,
			uuid,
			filename: meta.filename ?? `${uuid}.epub`,
			cookie: await this.deps.auth.getCookie(),
			signal,
			onProgress: (written, total) =>
				report(
					byteFraction(written, total),
					total > 0 ? { done: written, total } : undefined,
				),
			resolveUrl: async () =>
				onConnectedServer(
					(await client.files.getReaderUrl({ uuid, serverId })).url,
					this.deps.serverUrl,
				),
		});
		writeEntry({ ...entry, complete: true });
	}

	private async fetchAudiobook(
		uuid: string,
		serverId: string,
		signal: AbortSignal,
	) {
		const { client, orpc } = this.deps.api;
		const details = await this.deps.queryClient.fetchQuery(
			orpc.audiobooks.getDetails.queryOptions({ input: { uuid } }),
		);
		stopIfCancelled(signal);
		const book = playerBookFrom(uuid, details);
		const serverFiles = details.audioFiles ?? [];
		const tracks = book.files.map((file) => ({
			index: file.index,
			name: audioFileName(
				file.index,
				serverFiles.find((item) => item.index === file.index)?.filename ??
					details.filename ??
					"",
			),
		}));
		const previous = readEntry("audiobook", serverId, uuid);
		const entry: DownloadEntry = {
			kind: "audiobook",
			uuid,
			serverId,
			title: book.title,
			authors: book.authors,
			cover: book.cover,
			color: book.color,
			complete: false,
			savedAt: previous?.savedAt ?? Date.now(),
			reasons: this.reasonsFor(uuid, previous),
			finishedAt: previous?.finishedAt ?? null,
			seriesUuid: details.series?.uuid ?? null,
		};
		writeEntry(entry);
		saveAudiobookMeta(serverId, { ...book, tracks });
		this.diskChanged();
		await this.saveCover("audiobook", serverId, uuid, book.cover, signal);

		const report = this.reporter(uuid);
		const weights = book.files.map((file) => file.duration);
		for (const [position, track] of tracks.entries()) {
			stopIfCancelled(signal);
			const target = trackFile(serverId, uuid, track.name);
			// Files that made it before a cut are kept: the download resumes.
			if (hasFile(target)) continue;
			// Signed links live a minute: ask for each right before its turn.
			const { url } = await client.files.getAudioFileDownloadUrl({
				uuid,
				fileIndex: track.index,
			});
			stopIfCancelled(signal);
			await downloadInto(onConnectedServer(url, this.deps.serverUrl), target, {
				headers: await this.headers(),
				signal,
				onProgress: (written, total) =>
					report(
						weightedProgress(weights, position, byteFraction(written, total)),
						// One file (most m4b): its bytes are the whole title's.
						tracks.length === 1 && total > 0
							? { done: written, total }
							: undefined,
					),
			});
			report(weightedProgress(weights, position + 1, 0));
		}
		writeEntry({ ...entry, complete: true });
	}
}
