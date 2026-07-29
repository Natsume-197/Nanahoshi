import { m } from "@/paraglide/messages";
import { formatRelativeTime } from "@/utils/format";

/**
 * Muted line under the authors on a resume card: how far in, and how long ago.
 * The percentage is what decides which of several started books you pick up,
 * so it earns its place next to the cover's progress bar.
 */
export function resumeMeta(
	progress: number,
	lastActivityAt?: string | null,
): string {
	const percent = m["home.percent_read"]({ percent: Math.round(progress) });
	return lastActivityAt
		? `${percent} · ${formatRelativeTime(lastActivityAt)}`
		: percent;
}
