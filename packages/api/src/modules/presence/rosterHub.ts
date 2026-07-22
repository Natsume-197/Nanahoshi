import { membersRepository } from "../../routers/members/members.repository";
import type { PresenceEvent } from "./presence.types";
import * as presence from "./presenceManager";

// One shared roster subscription per server, fanned out to that server's live
// connections. Without this every connection registers the full member set in
// the interest index (O(members × connections) entries) and re-queries the
// roster on its own tick; here the per-server cost is one subscription, one
// refresh timer, and one membership query per interval, regardless of how many
// connections are open. The entry is dropped when the last connection leaves,
// so there is no cache to evict.

const ROSTER_REFRESH_MS = 30_000;

export interface RosterSink {
	onPresence: (event: PresenceEvent) => void;
	onRosterChanged: () => void;
}

interface RosterSubscription {
	update(ids: Iterable<string>): void;
	close(): void;
}

interface RosterDeps {
	loadMemberIds: (serverId: string) => Promise<string[]>;
	subscribe: (
		ids: Iterable<string>,
		onEvent: (event: PresenceEvent) => void,
	) => RosterSubscription;
	refreshMs?: number;
}

interface RosterEntry {
	sinks: Set<RosterSink>;
	signature: string;
	subscription: RosterSubscription | null;
	timer: ReturnType<typeof setInterval> | null;
	ready: Promise<void>;
	refreshing: boolean;
}

export class RosterHub {
	private readonly entries = new Map<string, RosterEntry>();
	private readonly refreshMs: number;

	constructor(private readonly deps: RosterDeps) {
		this.refreshMs = deps.refreshMs ?? ROSTER_REFRESH_MS;
	}

	/** Attach a connection to its server's shared roster. Returns a leave fn. */
	async join(serverId: string, sink: RosterSink): Promise<() => void> {
		let entry = this.entries.get(serverId);
		if (!entry) {
			const created: RosterEntry = {
				sinks: new Set(),
				signature: "",
				subscription: null,
				timer: null,
				ready: Promise.resolve(),
				refreshing: false,
			};
			created.ready = this.initialize(serverId, created);
			this.entries.set(serverId, created);
			entry = created;
		}
		entry.sinks.add(sink);
		try {
			await entry.ready;
		} catch (error) {
			entry.sinks.delete(sink);
			throw error;
		}
		return () => this.leave(serverId, sink);
	}

	/** Force an immediate roster re-check (e.g. right after a member removal). */
	invalidate(serverId: string): void {
		this.refresh(serverId).catch(() => {});
	}

	private async initialize(
		serverId: string,
		entry: RosterEntry,
	): Promise<void> {
		try {
			const ids = (await this.deps.loadMemberIds(serverId)).sort();
			// Everyone left (or load raced a teardown) — don't leak a subscription.
			if (this.entries.get(serverId) !== entry) return;
			entry.signature = ids.join("\0");
			entry.subscription = this.deps.subscribe(ids, (event) => {
				for (const sink of entry.sinks) sink.onPresence(event);
			});
			entry.timer = setInterval(() => {
				this.refresh(serverId).catch(() => {});
			}, this.refreshMs);
			entry.timer.unref?.();
		} catch (error) {
			if (this.entries.get(serverId) === entry) this.entries.delete(serverId);
			throw error;
		}
	}

	private leave(serverId: string, sink: RosterSink): void {
		const entry = this.entries.get(serverId);
		if (!entry) return;
		entry.sinks.delete(sink);
		if (entry.sinks.size > 0) return;
		this.entries.delete(serverId);
		if (entry.timer) clearInterval(entry.timer);
		entry.subscription?.close();
	}

	private async refresh(serverId: string): Promise<void> {
		const entry = this.entries.get(serverId);
		if (!entry || entry.refreshing || !entry.subscription) return;
		entry.refreshing = true;
		try {
			const ids = (await this.deps.loadMemberIds(serverId)).sort();
			if (this.entries.get(serverId) !== entry) return;
			const signature = ids.join("\0");
			if (signature === entry.signature) return;
			entry.signature = signature;
			entry.subscription.update(ids);
			for (const sink of entry.sinks) sink.onRosterChanged();
		} finally {
			entry.refreshing = false;
		}
	}
}

export const rosterHub = new RosterHub({
	loadMemberIds: (serverId) => membersRepository.listIds(serverId),
	subscribe: (ids, onEvent) => presence.subscribeToPresence(ids, onEvent),
});
