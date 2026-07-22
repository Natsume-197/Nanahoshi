import type {
	PresenceEvent,
	PresenceState,
} from "@nanahoshi-v2/api/modules/presence/presence.types";
import { comparePresenceRows } from "@nanahoshi-v2/api/modules/presence/presence.types";
import { useGatewayChannel } from "@/lib/gateway/use-gateway-channel";
import { orpc, queryClient } from "@/utils/orpc";

export type { PresenceState } from "@nanahoshi-v2/api/modules/presence/presence.types";

type MemberRow = {
	id: string;
	name: string;
	state: PresenceState;
	book: { uuid: string; title: string } | null;
};

const membersKey = orpc.members.withPresence.key();

function applyPresence(event: PresenceEvent) {
	queryClient.setQueriesData<MemberRow[]>({ queryKey: membersKey }, (old) => {
		if (!Array.isArray(old)) return old;
		let changed = false;
		const next = old.map((member) => {
			if (member.id !== event.userId) return member;
			changed = true;
			return { ...member, state: event.state, book: event.book ?? null };
		});
		if (!changed) return old;
		// Same comparator as the server snapshot so the live re-sort can't drift.
		return next.sort(comparePresenceRows);
	});
}

function invalidateMembers() {
	queryClient.invalidateQueries({ queryKey: membersKey });
}

export function usePresenceEvents() {
	// Presence rides the shared gateway WebSocket. On every (re)connect we refetch
	// the member snapshot so a stale panel re-syncs after a dropped connection.
	useGatewayChannel(
		"presence",
		(data) => applyPresence(data as PresenceEvent),
		invalidateMembers,
	);
	useGatewayChannel("members", invalidateMembers);
}
