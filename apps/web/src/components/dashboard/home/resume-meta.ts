import { m } from "@/paraglide/messages";
import { formatRelativeTime } from "@/utils/format";

/**
 * Muted meta for a resume list row, which has no progress bar of its own to
 * read the percentage off: how far in, and how long ago.
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

/**
 * Third line of a resume card: what it is, and how far in. The format label
 * earns its place on the mixed rail, where a book and an audiobook sit side by
 * side and the cover alone no longer says which is which.
 */
export function resumeCardMeta(
	mediaType: "ebook" | "audiobook",
	progress: number,
): string {
	const format =
		mediaType === "audiobook"
			? m["home.format_audiobook"]()
			: m["home.format_book"]();
	return `${format} · ${m["home.percent_read"]({ percent: Math.round(progress) })}`;
}
