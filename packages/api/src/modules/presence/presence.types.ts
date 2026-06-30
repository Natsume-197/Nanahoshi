// Pure presence types + ordering, shared by the server presence manager and the
// web client. No server-only imports, so it's safe to pull into the web bundle.

export type PresenceState =
	| "online"
	| "away"
	| "reading"
	| "listening"
	| "offline";

// The user-chosen status (a persistent preference), distinct from the resolved
// PresenceState. "online" lets activity/auto-idle drive the live state; "away"
// floors it at away when idle-free; "invisible" forces offline for everyone.
export const MANUAL_PRESENCE_STATUSES = [
	"online",
	"away",
	"invisible",
] as const;

export type ManualPresenceStatus = (typeof MANUAL_PRESENCE_STATUSES)[number];

export interface PresenceBook {
	uuid: string;
	title: string;
}

export interface PresenceEvent {
	userId: string;
	state: PresenceState;
	book?: PresenceBook | null;
}

// Friends-panel sort order: active first (reading/listening edge ahead of plain
// online), then away, then offline last. Single source of truth so the server's
// initial sort and the client's live re-sort can't drift.
export const STATE_WEIGHT: Record<PresenceState, number> = {
	reading: 0,
	listening: 0,
	online: 1,
	away: 2,
	offline: 3,
};
