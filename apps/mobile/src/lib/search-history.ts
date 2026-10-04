import type { TopHit } from "@nanahoshi/api/routers/search/search.model";
import * as SecureStore from "expo-secure-store";
import { useState } from "react";

/** The web's search history (use-search-history), kept on the device. */
const KEY = "nanahoshi.search-history";
const MAX = 12;

export type HistoryEntry =
	| { kind: "query"; query: string; visitedAt: number }
	| { kind: "hit"; hit: TopHit; visitedAt: number };

export function hitKey(hit: TopHit): string {
	switch (hit.type) {
		case "read-listen":
		case "collection":
			return `${hit.type}:${hit.id}`;
		case "user":
			return `user:${hit.username ?? hit.name}`;
		default:
			return `${hit.type}:${hit.uuid}`;
	}
}

export function entryKey(entry: HistoryEntry): string {
	return entry.kind === "query"
		? `query:${entry.query.toLowerCase()}`
		: `hit:${hitKey(entry.hit)}`;
}

function read(): HistoryEntry[] {
	try {
		const raw = SecureStore.getItem(KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
	} catch {
		return [];
	}
}

export function useSearchHistory() {
	const [history, setHistory] = useState(read);
	const commit = (next: HistoryEntry[]) => {
		setHistory(next);
		void SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(
			() => undefined,
		);
	};
	const push = (entry: HistoryEntry) =>
		commit(
			[
				entry,
				...history.filter((item) => entryKey(item) !== entryKey(entry)),
			].slice(0, MAX),
		);
	return {
		history,
		addQuery: (query: string) => {
			if (query) push({ kind: "query", query, visitedAt: Date.now() });
		},
		addHit: (hit: TopHit) => push({ kind: "hit", hit, visitedAt: Date.now() }),
		remove: (entry: HistoryEntry) =>
			commit(history.filter((item) => entryKey(item) !== entryKey(entry))),
	};
}
