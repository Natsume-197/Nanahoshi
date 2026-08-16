import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

// Intl.*Format constructors resolve locale data and are relatively expensive, so
// cache one instance per locale — these formatters run per list row on hot paths
// (likes, catalog dates, and other compact timestamps). The locale set is tiny (en, es).
const relativeTimeCache = new Map<string, Intl.RelativeTimeFormat>();
const dateCache = new Map<string, Intl.DateTimeFormat>();
const detailedDateCache = new Map<string, Intl.DateTimeFormat>();

function getFromCache<T>(
	cache: Map<string, T>,
	locale: string,
	make: () => T,
): T {
	let fmt = cache.get(locale);
	if (!fmt) {
		fmt = make();
		cache.set(locale, fmt);
	}
	return fmt;
}

const relativeTimeFormat = (locale: string) =>
	getFromCache(
		relativeTimeCache,
		locale,
		() => new Intl.RelativeTimeFormat(locale, { numeric: "always" }),
	);

const dateFormat = (locale: string) =>
	getFromCache(dateCache, locale, () => new Intl.DateTimeFormat(locale));

const detailedDateFormat = (locale: string) =>
	getFromCache(
		detailedDateCache,
		locale,
		() =>
			new Intl.DateTimeFormat(locale, {
				year: "numeric",
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			}),
	);

export function formatRelativeTime(dateStr: string) {
	const now = Date.now();
	const date = new Date(dateStr).getTime();
	const diffMs = now - date;
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);

	if (diffSec < 60) return m["time.just_now"]();
	const rtf = relativeTimeFormat(getLocale());
	if (diffMin < 60) return rtf.format(-diffMin, "minute");
	if (diffHour < 24) return rtf.format(-diffHour, "hour");
	if (diffDay < 7) return rtf.format(-diffDay, "day");
	return dateFormat(getLocale()).format(new Date(dateStr));
}

export function formatReadingTime(seconds: number) {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

export function formatTime(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	if (h > 0) {
		return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}
	return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatFileSize(filesizeKb?: number | null) {
	if (!filesizeKb) return null;
	if (filesizeKb >= 1024 ** 3)
		return `${(filesizeKb / 1024 ** 3).toFixed(2)} TB`;
	if (filesizeKb >= 1024 ** 2)
		return `${(filesizeKb / 1024 ** 2).toFixed(2)} GB`;
	if (filesizeKb >= 1024) return `${(filesizeKb / 1024).toFixed(1)} MB`;
	return `${filesizeKb} KB`;
}

/** Catalog-subtitle rating badge (e.g. "★ 4.3 avg"), or null when unrated. */
export function formatAvgRating(average: number | null | undefined) {
	return average != null ? `★ ${average.toFixed(1)} avg` : null;
}

export function formatDate(date: string | Date | null | undefined) {
	if (!date) return "";
	const parsed = new Date(date);
	if (Number.isNaN(parsed.getTime())) return String(date);
	return dateFormat(getLocale()).format(parsed);
}

export function formatDetailedDate(date: string | Date | null | undefined) {
	if (!date) return "";
	return detailedDateFormat(getLocale()).format(new Date(date));
}

export function formatNames(people: { name: string }[] | null | undefined) {
	return people?.map((p) => p.name).join(", ");
}

/** Genres and tags are stored normalized to lowercase; display them capitalized. */
export function capitalizeFirst(value: string): string {
	if (!value) return value;
	const [first] = value;
	const upper = first?.toLocaleUpperCase(getLocale());
	return upper === first ? value : `${upper}${value.slice(first?.length ?? 1)}`;
}

/** Extracts a 4-digit year from a date string (or full date). */
export function resolveYear(publishedDate?: string | null): string | null {
	if (!publishedDate) return null;
	const parsed = new Date(publishedDate);
	if (!Number.isNaN(parsed.getTime())) return String(parsed.getFullYear());
	const match = publishedDate.match(/\d{4}/);
	return match ? match[0] : null;
}

export function progressPercent(
	current: number | null | undefined,
	total: number | null | undefined,
) {
	if (!total || total <= 0) return 0;
	return Math.min(Math.round(((current ?? 0) / total) * 100), 100);
}

export function getErrorMessage(error: unknown, fallback?: string) {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return fallback ?? m["error.unexpected"]();
}
