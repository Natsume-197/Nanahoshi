import { ORPCError } from "@orpc/client";
import type { QueryClient } from "@tanstack/react-query";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { Api } from "@/lib/api";
import type { NanahoshiAuth } from "@/lib/auth-client";
import { onConnectedServer } from "@/reader/server-url";
import { downloadInto } from "./files";
import {
	type DownloadKind,
	exportFileName,
	exportMimeType,
	exportProgress,
	savedLocationLabel,
} from "./model";
import {
	discardDocument,
	pickSaveTarget,
	writeToDocument,
} from "./save-to-device";

// Exports go through the cache: the share sheet copies what it needs, and the
// OS may reclaim the rest.
const exportsDirectory = () => new Directory(Paths.cache, "exports");
const SAVED_VISIBLE_MS = 8_000;

export type ExportFailure = "forbidden" | "download" | "save";

/** One export, as the bar over the tab bar shows it. */
export type ExportJob = { uuid: string; kind: DownloadKind; title: string } & (
	| { phase: "downloading"; progress: number }
	/** Android: fetched, waiting for Share or Save. */
	| { phase: "ready" }
	| { phase: "saving"; progress: number }
	| { phase: "saved"; location: string | null }
	| { phase: "failed"; reason: ExportFailure }
);

type Deps = {
	serverUrl: string;
	auth: NanahoshiAuth;
	api: Api;
	queryClient: QueryClient;
};

/**
 * "Export file…": the title's real file (EPUB, M4B, or a ZIP for multi-file
 * audiobooks, as the web's download button serves it). Always fetched through
 * the server's download permission — never copied from the offline copy,
 * which only needs read access. iOS hands it to the share sheet (which has
 * "Save to Files"); Android offers Share or Save, and saving writes into a
 * folder the user picks. Every step is a state of one in-app bar — no
 * dialogs.
 */
export class ExportManager {
	private job: ExportJob | null = null;
	private abort: AbortController | null = null;
	private file: { file: File; name: string; mimeType: string } | null = null;
	private hideTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly listeners = new Set<() => void>();

	constructor(private readonly deps: Deps) {}

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};
	getSnapshot = () => this.job;
	private set(job: ExportJob | null) {
		if (this.hideTimer) clearTimeout(this.hideTimer);
		this.hideTimer = null;
		this.job = job;
		for (const listener of this.listeners) listener();
	}
	private update(patch: Partial<ExportJob> & Pick<ExportJob, "phase">) {
		if (this.job) this.set({ ...this.job, ...patch } as ExportJob);
	}

	/** Closes the bar, stopping whatever it was doing. */
	dismiss = () => {
		this.abort?.abort();
		this.abort = null;
		this.set(null);
	};

	start = async (kind: DownloadKind, uuid: string, title: string) => {
		this.dismiss();
		const abort = new AbortController();
		this.abort = abort;
		this.file = null;
		this.set({ uuid, kind, title, phase: "downloading", progress: 0 });
		try {
			const { client, orpc } = this.deps.api;
			const [{ url, filename }, sizeHint] = await Promise.all([
				client.files.getSignedDownloadUrl({ uuid }),
				kind === "audiobook"
					? this.deps.queryClient
							.fetchQuery(
								orpc.audiobooks.getDetails.queryOptions({ input: { uuid } }),
							)
							.then((details) => (details.filesizeKb ?? 0) * 1024)
							.catch(() => 0)
					: 0,
			]);
			if (abort.signal.aborted) return;
			const directory = exportsDirectory();
			if (directory.exists) directory.delete();
			directory.create({ intermediates: true, idempotent: true });
			const name = exportFileName(filename, `${uuid}.bin`);
			const cookie = await this.deps.auth.getCookie();
			let lastStep = 0;
			const file = await downloadInto(
				onConnectedServer(url, this.deps.serverUrl),
				new File(directory, name),
				{
					headers: cookie ? { Cookie: cookie } : undefined,
					signal: abort.signal,
					onProgress: (written, total) => {
						const step = Math.floor(
							exportProgress(written, total, sizeHint) * 100,
						);
						if (step === lastStep || abort.signal.aborted) return;
						lastStep = step;
						this.update({ phase: "downloading", progress: step / 100 });
					},
				},
			);
			if (abort.signal.aborted) return;
			this.abort = null;
			this.file = { file, name, mimeType: exportMimeType(name) };
			if (process.env.EXPO_OS === "android") {
				this.update({ phase: "ready" });
				return;
			}
			await this.share();
		} catch (error) {
			if (abort.signal.aborted) return;
			console.warn("[export] download failed", error);
			this.abort = null;
			this.update({
				phase: "failed",
				reason:
					error instanceof ORPCError && error.code === "FORBIDDEN"
						? "forbidden"
						: "download",
			});
		}
	};

	/** Downloads again after a failure. */
	retry = () => {
		const job = this.job;
		if (!job) return;
		if (job.phase === "failed" && job.reason === "save" && this.file)
			return void this.save();
		void this.start(job.kind, job.uuid, job.title);
	};

	share = async () => {
		const exported = this.file;
		if (!exported) return;
		const title = this.job?.title;
		this.set(null);
		await Sharing.shareAsync(exported.file.uri, {
			mimeType: exported.mimeType,
			dialogTitle: title,
		}).catch(() => undefined);
	};

	save = async () => {
		const exported = this.file;
		if (!exported) return;
		let target: string | null;
		try {
			target = await pickSaveTarget(exported.name, exported.mimeType);
		} catch (error) {
			console.warn("[export] save as failed", error);
			return this.update({ phase: "failed", reason: "save" });
		}
		// Dismissed the folder picker: stay ready to try again or share.
		if (!target) return this.update({ phase: "ready" });
		this.update({ phase: "saving", progress: 0 });
		try {
			let lastStep = -1;
			await writeToDocument(exported.file, target, (fraction) => {
				const step = Math.floor(fraction * 100);
				if (step === lastStep) return;
				lastStep = step;
				this.update({ phase: "saving", progress: step / 100 });
			});
		} catch (error) {
			console.warn("[export] save failed", error);
			discardDocument(target);
			return this.update({ phase: "failed", reason: "save" });
		}
		this.update({ phase: "saved", location: savedLocationLabel(target) });
		this.hideTimer = setTimeout(() => this.set(null), SAVED_VISIBLE_MS);
	};
}
