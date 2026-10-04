import { getLocales } from "expo-localization";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import readerEn from "../../../../packages/reader/src/i18n/messages/en.json";
import readerEs from "../../../../packages/reader/src/i18n/messages/es.json";
import readerJa from "../../../../packages/reader/src/i18n/messages/ja.json";
import en from "../../../web/messages/en.json";
import es from "../../../web/messages/es.json";
import ja from "../../../web/messages/ja.json";
import { mobileMessages } from "./mobile-messages";
import {
	type LanguagePreference,
	parseLanguagePreference,
	resolveLanguage,
} from "./preferences";

/**
 * The phone app reads the web app's message catalogs directly, so every string
 * already translated for the web (en/es/ja) is translated here too and the two
 * never drift. Keys are the same dotted paths the web's `m["…"]` uses; the few
 * phone-only strings live in mobile-messages.ts under `mobile.*`, and the
 * reader's own strings in packages/reader's catalog.
 */
type Catalog = Record<string, unknown>;
const catalogs: Record<string, Catalog> = { en, es, ja };
// The reader's own strings (reading sessions, goals) moved to its package.
const readerCatalogs: Record<string, Catalog> = {
	en: readerEn,
	es: readerEs,
	ja: readerJa,
};

const LANGUAGE_KEY = "nanahoshi.language";
let languagePreference = parseLanguagePreference(
	SecureStore.getItem(LANGUAGE_KEY),
);
export let locale: string = resolveLanguage(
	languagePreference,
	getLocales()[0]?.languageCode,
);
const localeListeners = new Set<() => void>();

export function getLanguagePreference(): LanguagePreference {
	return languagePreference;
}

export async function setLanguagePreference(preference: LanguagePreference) {
	if (preference === "system") await SecureStore.deleteItemAsync(LANGUAGE_KEY);
	else await SecureStore.setItemAsync(LANGUAGE_KEY, preference);
	languagePreference = preference;
	locale = resolveLanguage(preference, getLocales()[0]?.languageCode);
	for (const listener of localeListeners) listener();
}

/** Re-renders on a language change; the root remounts the app on it, since
 * `t()` is read during render everywhere. */
export function useLocale(): string {
	return useSyncExternalStore(
		(listener) => {
			localeListeners.add(listener);
			return () => localeListeners.delete(listener);
		},
		() => locale,
	);
}

type Params = Record<string, string | number>;

function lookup(catalog: Catalog, key: string): unknown {
	if (key in catalog) return catalog[key];
	let node: unknown = catalog;
	for (const part of key.split(".")) {
		if (!node || typeof node !== "object" || !(part in node)) return undefined;
		node = (node as Record<string, unknown>)[part];
	}
	return node;
}

type Variant = { match?: Record<string, string> };

function resolve(value: unknown, params: Params | undefined): string | null {
	if (typeof value === "string") return value;
	// Paraglide plural messages: [{ declarations, selectors, match: { "countPlural=one": … } }]
	const variant = Array.isArray(value) ? (value[0] as Variant) : null;
	if (variant?.match) {
		const count = Number(params?.count ?? 0);
		let category: string = count === 1 ? "one" : "other";
		try {
			category = new Intl.PluralRules(locale).select(count);
		} catch {}
		const entries = Object.entries(variant.match);
		const hit =
			entries.find(([k]) => k.endsWith(`=${category}`)) ??
			entries.find(([k]) => k.endsWith("=other")) ??
			entries[0];
		return hit?.[1] ?? null;
	}
	return null;
}

export function t(key: string, params?: Params): string {
	const text =
		mobileMessages[locale]?.[key] ??
		mobileMessages.en[key] ??
		resolve(lookup(catalogs[locale], key), params) ??
		resolve(lookup(readerCatalogs[locale], key), params) ??
		resolve(lookup(en, key), params) ??
		resolve(lookup(readerEn, key), params) ??
		key;
	if (!params) return text;
	return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
		name in params ? String(params[name]) : whole,
	);
}
