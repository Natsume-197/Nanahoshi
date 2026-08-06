import {
	MANUAL_PRESENCE_STATUSES,
	type ManualPresenceStatus,
} from "@nanahoshi-v2/api/modules/presence/presence.types";
import { PRESENCE_DOT } from "@/components/shared/presence-dot";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

export { MANUAL_PRESENCE_STATUSES, type ManualPresenceStatus };

// Discord-style manual status. Invisible appears offline to others, so it reuses
// the offline dot color.
export const STATUS_META: Record<
	ManualPresenceStatus,
	{ label: () => string; dot: string }
> = {
	online: { label: m["status.online"], dot: PRESENCE_DOT.online },
	away: { label: m["status.away"], dot: PRESENCE_DOT.away },
	invisible: { label: m["status.invisible"], dot: PRESENCE_DOT.offline },
};

export function StatusDot({
	status,
	className,
}: {
	status: ManualPresenceStatus;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"size-2.5 shrink-0 rounded-full",
				STATUS_META[status].dot,
				className,
			)}
		/>
	);
}

/** The status to show for a profile that may not have loaded, or that predates
 *  the field. Online is the neutral default the server also assumes. */
export function resolvePresenceStatus(
	profile: { presenceStatus?: string | null } | null | undefined,
): ManualPresenceStatus {
	const status = profile?.presenceStatus;
	return MANUAL_PRESENCE_STATUSES.includes(status as ManualPresenceStatus)
		? (status as ManualPresenceStatus)
		: "online";
}

/** The optimistic cache write: the same profile with its status swapped. Returns
 *  the entry untouched when there's nothing cached yet, so the pending fetch
 *  isn't replaced by a half-built profile. Shaped as a react-query `Updater`,
 *  hence `T | undefined` in and out. */
export function withPresenceStatus<T extends { presenceStatus?: unknown }>(
	profile: T | undefined,
	next: ManualPresenceStatus,
): T | undefined {
	// Cast: spreading T back into T is beyond what TS infers, but the shape is
	// unchanged apart from the one field we overwrite.
	return profile ? ({ ...profile, presenceStatus: next } as T) : profile;
}
