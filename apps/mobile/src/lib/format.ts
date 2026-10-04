import { locale, t } from "./i18n";

type Named = { name?: string | null };

export function joinNames(
	people: readonly Named[] | null | undefined,
	max = 2,
) {
	const names = (people ?? [])
		.map((person) => person.name?.trim())
		.filter((name): name is string => !!name);
	if (names.length <= max) return names.join(", ");
	return `${names.slice(0, max).join(", ")} +${names.length - max}`;
}

/** 13h 47m / 42m — the way Storytel and Audible label a listen. */
export function formatDuration(totalSeconds: number | null | undefined) {
	if (!totalSeconds || totalSeconds <= 0) return null;
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.round((totalSeconds % 3600) / 60);
	if (hours === 0) return `${Math.max(minutes, 1)}m`;
	return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function percent(
	part: number | null | undefined,
	whole: number | null | undefined,
) {
	if (!part || !whole || whole <= 0) return 0;
	return Math.min(100, Math.max(0, Math.round((part / whole) * 100)));
}

export function formatCount(value: number) {
	try {
		return new Intl.NumberFormat(locale, {
			notation: "compact",
			maximumFractionDigits: 1,
		}).format(value);
	} catch {
		return String(value);
	}
}

export function titleOrUntitled(title: string | null | undefined) {
	return title?.trim() || t("book.untitled");
}

/** Hermes ships only part of Intl on Android; fall back to the raw code. */
export function languageName(code: string | null | undefined) {
	if (!code) return null;
	try {
		if (typeof Intl.DisplayNames !== "function") return code.toUpperCase();
		return (
			new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code
		);
	} catch {
		return code.toUpperCase();
	}
}

/** "ahora mismo" / "hace 5 minutos" / "hace 3 horas" / a date after a week —
 * the web's formatRelativeTime. */
export function formatRelativeTime(iso: string | Date, now = Date.now()) {
	const date = new Date(iso);
	const seconds = Math.floor((now - date.getTime()) / 1000);
	if (seconds < 60) return t("time.just_now");
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	try {
		const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
		if (minutes < 60) return rtf.format(-minutes, "minute");
		if (hours < 24) return rtf.format(-hours, "hour");
		if (days < 7) return rtf.format(-days, "day");
		return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
			date,
		);
	} catch {
		return date.toLocaleDateString(locale);
	}
}
