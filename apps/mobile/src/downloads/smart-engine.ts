import { onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState } from "react-native";
import type { Api, ApiCall } from "@/lib/api";
import type { NanahoshiAuth } from "@/lib/auth-client";
import { listDownloads, readEntry, readSmartState } from "./files";
import type { DownloadManager } from "./manager";
import type { DownloadKind, DownloadReason } from "./model";
import {
	NEXT_VOLUME_AT,
	nextInSeries,
	planSync,
	progressFraction,
	WANT_LIMIT,
	type WantedTitle,
} from "./smart";
import { smartDownloads, smartOnCellular } from "./smart-settings";

const SYNC_DELAY_MS = 2000;
/** A finished title being read again refreshes its date at most this often. */
const FINISH_REFRESH_MS = 60_000;
const COLLECTION_PAGE = 50;
const COLLECTION_MAX_PAGES = 20;

/** Calls after which the shelves or collections may want other titles. */
const SOURCE_CHANGES = new Set([
	"bookShelf.set",
	"bookShelf.remove",
	"audiobookShelf.set",
	"audiobookShelf.remove",
	"collections.setBookMembership",
	"collections.updateDefinition",
]);

type Deps = {
	api: Api;
	auth: NanahoshiAuth;
	manager: DownloadManager;
	/** The title the player has loaded: never pulled from under it. */
	inUse: () => string | null;
};

type SessionAtom = {
	get: () => { data?: { session?: { activeOrganizationId?: string | null } } };
};

/**
 * Smart downloads: brings down the next volume of a series being read, what
 * the user is reading, the newest of "want to read" and offline collections,
 * and clears finished titles after a grace period. The rules live in
 * smart.ts; this class feeds them and carries out their plan.
 */
export class SmartDownloads {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private syncing = false;
	private again = false;
	/** Titles whose next volume was already asked for this session. */
	private readonly nexted = new Set<string>();

	constructor(private readonly deps: Deps) {}

	/** Starts listening; returns the cleanup for useMountEffect. */
	start() {
		const stops = [
			this.deps.api.onCall((call) => this.onCall(call)),
			onlineManager.subscribe((online) => {
				if (online) this.schedule();
			}),
			smartDownloads.subscribe(() => this.schedule()),
			smartOnCellular.subscribe(() => this.schedule()),
		];
		const app = AppState.addEventListener("change", (state) => {
			if (state === "active") this.schedule();
		});
		const network = Network.addNetworkStateListener(() => this.schedule());
		this.schedule();
		return () => {
			for (const stop of stops) stop();
			app.remove();
			network.remove();
			if (this.timer) clearTimeout(this.timer);
		};
	}

	/** Runs a sync soon; calls in a burst share one. */
	schedule() {
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.sync();
		}, SYNC_DELAY_MS);
	}

	private serverId(): string | null {
		const atom = this.deps.auth.$store.atoms.session as unknown as SessionAtom;
		return atom.get().data?.session?.activeOrganizationId ?? null;
	}

	private onCall({ path, input }: ApiCall) {
		const name = path.join(".");
		if (SOURCE_CHANGES.has(name)) return this.schedule();
		if (name === "readingProgress.saveProgress")
			return this.onProgress("book", path, input);
		if (name === "listeningProgress.saveProgress")
			return this.onProgress("audiobook", path, input);
	}

	private onProgress(
		kind: DownloadKind,
		path: readonly string[],
		input: unknown,
	) {
		const serverId = this.serverId();
		const fields = input as Record<string, unknown>;
		const uuid = typeof fields?.bookUuid === "string" ? fields.bookUuid : null;
		if (!serverId || !uuid) return;
		const entry = readEntry(kind, serverId, uuid);
		if (!entry?.complete) return;
		const fraction = progressFraction(path, fields);
		const now = Date.now();
		// Finishing starts the grace; reading it again restarts it.
		if (
			(fraction === 1 || entry.finishedAt) &&
			now - (entry.finishedAt ?? 0) > FINISH_REFRESH_MS
		) {
			this.deps.manager.updateEntry(kind, serverId, uuid, { finishedAt: now });
			if (fraction === 1) this.schedule();
		}
		if (
			fraction !== null &&
			fraction >= NEXT_VOLUME_AT &&
			smartDownloads.isOn() &&
			!this.nexted.has(uuid)
		) {
			this.nexted.add(uuid);
			void this.queueNext(kind, serverId, uuid, entry.seriesUuid).catch(() =>
				this.nexted.delete(uuid),
			);
		}
	}

	private async queueNext(
		kind: DownloadKind,
		serverId: string,
		uuid: string,
		known: string | null | undefined,
	) {
		const { client } = this.deps.api;
		let seriesUuid = known;
		// Downloads from before smart downloads don't know their series yet.
		if (seriesUuid === undefined) {
			const details =
				kind === "book"
					? await client.books.getBookWithMetadata({ uuid })
					: await client.audiobooks.getDetails({ uuid });
			seriesUuid = details?.series?.uuid ?? null;
			this.deps.manager.updateEntry(kind, serverId, uuid, { seriesUuid });
		}
		if (!seriesUuid) return;
		const volumes =
			kind === "book"
				? await client.books.listBySeries({ seriesUuid })
				: await client.audiobooks.listBySeries({ seriesUuid });
		const next = nextInSeries(
			volumes.map((volume) => ({
				uuid: volume.uuid,
				position: volume.position ?? null,
			})),
			uuid,
		);
		const { manager } = this.deps;
		if (
			!next ||
			readEntry(kind, serverId, next) ||
			manager.getSnapshot().jobs[next] ||
			manager.isDismissed(serverId, next)
		)
			return;
		if (!(await this.mayDownload())) {
			// Not on an allowed network: the next progress save tries again.
			this.nexted.delete(uuid);
			return;
		}
		manager.download(kind, next, serverId, [{ type: "series" }]);
	}

	/** Online, and on Wi-Fi unless mobile data is allowed. */
	private async mayDownload() {
		if (!onlineManager.isOnline()) return false;
		const state = await Network.getNetworkStateAsync().catch(() => null);
		if (!state?.isConnected) return false;
		if (
			state.type === Network.NetworkStateType.WIFI ||
			state.type === Network.NetworkStateType.ETHERNET
		)
			return true;
		return smartOnCellular.isOn();
	}

	private async sync() {
		if (this.syncing) {
			this.again = true;
			return;
		}
		this.syncing = true;
		try {
			await this.syncOnce();
		} catch {
			// A failed round changes nothing; the next trigger tries again.
		} finally {
			this.syncing = false;
			if (this.again) {
				this.again = false;
				this.schedule();
			}
		}
	}

	private async syncOnce() {
		const serverId = this.serverId();
		if (!serverId) return;
		const { manager } = this.deps;
		const entries = listDownloads(serverId);
		const { wanted, loaded } = onlineManager.isOnline()
			? await this.loadSources(serverId, smartDownloads.isOn())
			: { wanted: [], loaded: new Set<string>() };
		// Collections no longer offline: their reasons are judged (and dropped).
		const offline = new Set(
			readSmartState(serverId).collections.map((c) => `collection:${c.id}`),
		);
		for (const entry of entries)
			for (const reason of entry.reasons ?? [])
				if (reason.type === "collection") {
					const key = `collection:${reason.id}`;
					if (!offline.has(key)) loaded.add(key);
				}
		// Downloads only a collection no longer kept offline asked for stop now.
		for (const [uuid, job] of Object.entries(manager.getSnapshot().jobs)) {
			const reasons = manager.pendingReasons(uuid);
			if (
				job.status !== "failed" &&
				reasons &&
				reasons.length > 0 &&
				reasons.every(
					(reason) =>
						reason.type === "collection" &&
						!offline.has(`collection:${reason.id}`),
				)
			)
				manager.cancel(uuid);
		}

		const plan = planSync({
			entries,
			wanted,
			loaded,
			// Failed jobs aren't busy: each sync gives them another try.
			busy: new Set(
				Object.entries(manager.getSnapshot().jobs)
					.filter(([, job]) => job.status !== "failed")
					.map(([uuid]) => uuid),
			),
			now: Date.now(),
			clearFinished: smartDownloads.isOn(),
		});
		for (const { kind, uuid, reasons } of plan.update)
			manager.updateEntry(kind, serverId, uuid, { reasons });
		const inUse = this.deps.inUse();
		for (const { kind, uuid } of plan.remove)
			if (uuid !== inUse)
				manager.remove(kind, serverId, uuid, { byUser: false });
		// One at a time: books (megabytes) go before audiobooks (hundreds).
		const downloads = plan.download
			.filter((title) => !manager.isDismissed(serverId, title.uuid))
			.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "book" ? -1 : 1));
		if (downloads.length > 0 && (await this.mayDownload()))
			for (const { kind, uuid, reasons } of downloads)
				manager.download(kind, uuid, serverId, reasons);
	}

	/** What the shelves and offline collections want on the phone; a source
	 * that fails to answer is left out of `loaded`. Shelves only count with
	 * smart downloads on; offline collections work either way. */
	private async loadSources(serverId: string, shelves: boolean) {
		const { client } = this.deps.api;
		const wanted: WantedTitle[] = [];
		const loaded = new Set<string>();
		const add = (kind: DownloadKind, uuid: string, reason: DownloadReason) =>
			wanted.push({ kind, uuid, reason });

		const shelfSources = shelves
			? [
					Promise.all([
						client.bookShelf.list({ status: "reading", limit: 100 }),
						client.audiobookShelf.list({ status: "listening", limit: 100 }),
					])
						.then(([books, audiobooks]) => {
							for (const row of books)
								add("book", row.bookUuid, { type: "reading" });
							for (const row of audiobooks)
								add("audiobook", row.bookUuid, { type: "reading" });
							loaded.add("reading");
						})
						.catch(() => undefined),
					Promise.all([
						client.bookShelf.list({
							status: "want_to_read",
							limit: WANT_LIMIT,
						}),
						client.audiobookShelf.list({
							status: "want_to_listen",
							limit: WANT_LIMIT,
						}),
					])
						.then(([books, audiobooks]) => {
							for (const row of books)
								add("book", row.bookUuid, { type: "want" });
							for (const row of audiobooks)
								add("audiobook", row.bookUuid, { type: "want" });
							loaded.add("want");
						})
						.catch(() => undefined),
				]
			: [];
		await Promise.all([
			...shelfSources,
			...readSmartState(serverId).collections.map(async (collection) => {
				try {
					const reason = {
						type: "collection" as const,
						id: collection.id,
						name: collection.name,
					};
					let cursor: number | null = 0;
					for (
						let page = 0;
						cursor !== null && page < COLLECTION_MAX_PAGES;
						page++
					) {
						const result = await client.collections.listItems({
							collectionId: collection.id,
							cursor,
							limit: COLLECTION_PAGE,
						});
						for (const item of result.items)
							add(
								item.mediaType === "audiobook" ? "audiobook" : "book",
								item.uuid,
								reason,
							);
						cursor = result.pagination.nextCursor ?? null;
					}
					loaded.add(`collection:${collection.id}`);
				} catch {}
			}),
		]);
		return { wanted, loaded };
	}
}
