import type { PresenceState } from "@/hooks/use-presence-events";

// Single source of truth for presence dot colors, shared by the friends list and
// the profile status selector so the two can't drift.
export const PRESENCE_DOT: Record<PresenceState, string> = {
	reading: "bg-sky-500",
	listening: "bg-violet-500",
	away: "bg-amber-500",
	online: "bg-emerald-500",
	offline: "bg-muted-foreground/40",
};
