import {
	compareVersions,
	parseVersion,
} from "@nanahoshi/api/modules/updates/version";
import { getLocale } from "@/paraglide/runtime";
import en from "./whats-new/en.json";
import es from "./whats-new/es.json";
import ja from "./whats-new/ja.json";

// Post-update notes, bundled with the app: reading them sends nothing and
// needs no network. Each release that has something to say gets an entry in
// every language file, in the same order; a language missing an entry shows
// the English one. Keep entries for people who skip releases.

export interface WhatsNewEntry {
	version: string;
	date: string;
	/** Steps the update requires, shown first. */
	notices: string[];
	groups: { type: "added" | "changed" | "fixed"; items: string[] }[];
}

const CATALOGS: Record<string, WhatsNewEntry[]> = {
	en: en as WhatsNewEntry[],
	es: es as WhatsNewEntry[],
	ja: ja as WhatsNewEntry[],
};

export function whatsNewCatalog(locale = getLocale()): WhatsNewEntry[] {
	const english = CATALOGS.en ?? [];
	const translated = new Map(
		(CATALOGS[locale] ?? []).map((entry) => [entry.version, entry]),
	);
	return english.map((entry) => translated.get(entry.version) ?? entry);
}

/** Entries after `seen` up to and including `release`, newest first. */
export function entriesBetween(
	catalog: WhatsNewEntry[],
	seen: string | null,
	release: string,
) {
	return catalog
		.filter(
			(entry) =>
				(compareVersions(entry.version, release) ?? 1) <= 0 &&
				(seen === null || (compareVersions(entry.version, seen) ?? -1) > 0),
		)
		.sort((a, b) => compareVersions(b.version, a.version) ?? 0);
}

export type WhatsNewDecision =
	/** Nothing to show; store `marker` (a new browser, or nothing new). */
	| { show: false; marker: string | null }
	| { show: true; marker: string; entries: WhatsNewEntry[] };

/**
 * What to do when the app opens on `release` with `seen` stored. A browser
 * with nothing stored starts at this release silently, so a first visit isn't
 * greeted with notes. The marker only moves forward, and only for releases.
 */
export function decideWhatsNew(
	catalog: WhatsNewEntry[],
	seen: string | null,
	release: string,
): WhatsNewDecision {
	if (!parseVersion(release)) return { show: false, marker: null };
	if (!seen || !parseVersion(seen)) return { show: false, marker: release };
	if ((compareVersions(release, seen) ?? 0) <= 0) {
		return { show: false, marker: null };
	}
	const entries = entriesBetween(catalog, seen, release);
	return entries.length > 0
		? { show: true, marker: release, entries }
		: { show: false, marker: release };
}

export function whatsNewStorageKey(userId: string) {
	return `nanahoshi:whats-new:${userId}`;
}
