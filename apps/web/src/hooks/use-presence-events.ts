import type {
	PresenceEvent,
	PresenceState,
} from "@nanahoshi-v2/api/modules/presence/presence.types";
import { STATE_WEIGHT } from "@nanahoshi-v2/api/modules/presence/presence.types";
import { useGatewayChannel } from "@/lib/gateway/use-gateway-channel";
import { orpc, queryClient } from "@/utils/orpc";

export type { PresenceState } from "@nanahoshi-v2/api/modules/presence/presence.types";

type FriendRow = {
	id: string;
	state: PresenceState;
	book: { uuid: string; title: string } | null;
};

const friendsKey = orpc.follow.getFriendsWithPresence.key();

function applyPresence(event: PresenceEvent) {
	queryClient.setQueriesData<FriendRow[]>({ queryKey: friendsKey }, (old) => {
		if (!Array.isArray(old)) return old;
		let changed = false;
		const next = old.map((friend) => {
			if (friend.id !== event.userId) return friend;
			changed = true;
			return { ...friend, state: event.state, book: event.book ?? null };
		});
		if (!changed) return old;
		return next.sort((a, b) => STATE_WEIGHT[a.state] - STATE_WEIGHT[b.state]);
	});
}

function invalidateFriends() {
	queryClient.invalidateQueries({ queryKey: friendsKey });
}

export function usePresenceEvents() {
	// Presence rides the shared gateway WebSocket. On every (re)connect we refetch
	// the friends snapshot so a stale panel re-syncs after a dropped connection.
	useGatewayChannel(
		"presence",
		(data) => applyPresence(data as PresenceEvent),
		invalidateFriends,
	);
	// A `friends` message means the mutual-follow graph changed — refetch to pick
	// up the added/removed friend (their live presence routing already updated
	// server-side).
	useGatewayChannel("friends", invalidateFriends);
}
