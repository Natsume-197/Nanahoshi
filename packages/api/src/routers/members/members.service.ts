import {
	comparePresenceRows,
	type PresenceState,
} from "../../modules/presence/presence.types";
import * as presence from "../../modules/presence/presenceManager";
import { membersRepository } from "./members.repository";

// Bounds the presence pipeline (4 Redis ops per member) and the panel payload.
// Members beyond the cap (by name order) simply don't appear in the panel,
// matching Discord's capped member list on huge servers.
export const MEMBER_LIST_LIMIT = 1000;

export async function getWithPresence(serverId: string) {
	const members = await membersRepository.list(serverId, MEMBER_LIST_LIMIT);
	const presenceMap = await presence.getPresenceFor(
		members.map((member) => member.id),
	);

	return members
		.map((member) => {
			const currentPresence = presenceMap.get(member.id);
			return {
				...member,
				state: currentPresence?.state ?? ("offline" as PresenceState),
				book: currentPresence?.book ?? null,
			};
		})
		.sort(comparePresenceRows);
}
