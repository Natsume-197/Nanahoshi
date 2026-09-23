import type { TopHit } from "@nanahoshi/api/routers/search/search.model";
import { useCallback, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { searchResultKey } from "@/lib/search-result-batches";

const STORAGE_KEY = "nanahoshi:search-history";
const CHANGE_EVENT = `${STORAGE_KEY}:change`;
const MAX_ENTRIES = 12;

export type SearchHistoryEntry =
	| { kind: "query"; query: string; visitedAt: number }
	| { kind: "hit"; hit: TopHit; visitedAt: number };
type NewSearchHistoryEntry =
	| { kind: "query"; query: string }
	| { kind: "hit"; hit: TopHit };

export function searchHistoryEntryKey(entry: SearchHistoryEntry): string {
	return entry.kind === "query"
		? `query-${entry.query.toLowerCase()}`
		: `hit-${searchResultKey(entry.hit)}`;
}

function isStoredHit(value: unknown): value is TopHit {
	if (typeof value !== "object" || value === null) return false;
	const hit = value as Record<string, unknown>;
	const hasIdentity = (field: "id" | "uuid") => typeof hit[field] === "string";
	const hasName = () => typeof hit.name === "string";
	const isPublication = (publication: unknown) => {
		if (typeof publication !== "object" || publication === null) return false;
		const entry = publication as Record<string, unknown>;
		return (
			typeof entry.uuid === "string" &&
			typeof entry.title === "string" &&
			Array.isArray(entry.authors)
		);
	};

	switch (hit.type) {
		case "book":
		case "audiobook":
			return (
				hasIdentity("uuid") &&
				typeof hit.filename === "string" &&
				Array.isArray(hit.authors)
			);
		case "read-listen":
			return (
				hasIdentity("id") &&
				isPublication(hit.ebook) &&
				isPublication(hit.audiobook)
			);
		case "series":
			return (
				hasIdentity("uuid") &&
				hasName() &&
				Array.isArray(hit.previewCovers) &&
				(hit.mediaType === "ebook" || hit.mediaType === "audiobook")
			);
		case "author":
		case "narrator":
			return hasIdentity("uuid") && hasName();
		case "collection":
			return hasIdentity("id") && hasName() && Array.isArray(hit.previewCovers);
		case "user":
			return hasName();
		default:
			return false;
	}
}

function isEntry(value: unknown): value is SearchHistoryEntry {
	if (typeof value !== "object" || value === null) return false;
	const entry = value as Record<string, unknown>;
	if (typeof entry.visitedAt !== "number") return false;
	return entry.kind === "query"
		? typeof entry.query === "string"
		: entry.kind === "hit" && isStoredHit(entry.hit);
}

function read(): SearchHistoryEntry[] {
	if (typeof window === "undefined") return [];
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		const parsed: unknown = JSON.parse(stored ?? "[]");
		if (stored !== null && Array.isArray(parsed)) {
			return parsed.filter(isEntry).sort((a, b) => b.visitedAt - a.visitedAt);
		}

		const now = Date.now();
		const queries: unknown = JSON.parse(
			window.localStorage.getItem("nanahoshi:recent-searches") ?? "[]",
		);
		const hits: unknown = JSON.parse(
			window.localStorage.getItem("nanahoshi:recent-search-items") ?? "[]",
		);
		const legacyHits = Array.isArray(hits) ? hits.filter(isStoredHit) : [];
		const legacyQueries = Array.isArray(queries)
			? queries.filter((query): query is string => typeof query === "string")
			: [];
		return [
			...legacyHits.map(
				(hit, index) => ({ kind: "hit", hit, visitedAt: now - index }) as const,
			),
			...legacyQueries.map(
				(query, index) =>
					({
						kind: "query",
						query,
						visitedAt: now - legacyHits.length - index,
					}) as const,
			),
		].slice(0, MAX_ENTRIES);
	} catch {
		return [];
	}
}

function write(entries: SearchHistoryEntry[]) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
		window.dispatchEvent(new window.Event(CHANGE_EVENT));
	} catch {
		// Ignore quota / privacy-mode failures.
	}
}

export function useSearchHistory() {
	const [history, setHistory] = useState<SearchHistoryEntry[]>(read);
	useMountEffect(() => {
		const sync = () => setHistory(read());
		window.addEventListener(CHANGE_EVENT, sync);
		return () => window.removeEventListener(CHANGE_EVENT, sync);
	});

	const add = useCallback(
		(entry: NewSearchHistoryEntry, replacedQuery?: string) => {
			setHistory((previous) => {
				const nextEntry = {
					...entry,
					visitedAt: Date.now(),
				} as SearchHistoryEntry;
				const key = searchHistoryEntryKey(nextEntry);
				const replacedKey = replacedQuery
					? `query-${replacedQuery.trim().toLowerCase()}`
					: null;
				const next = [
					nextEntry,
					...previous.filter((item) => {
						const itemKey = searchHistoryEntryKey(item);
						return itemKey !== key && itemKey !== replacedKey;
					}),
				].slice(0, MAX_ENTRIES);
				write(next);
				return next;
			});
		},
		[],
	);

	const remove = useCallback((entry: SearchHistoryEntry) => {
		setHistory((previous) => {
			const key = searchHistoryEntryKey(entry);
			const next = previous.filter(
				(item) => searchHistoryEntryKey(item) !== key,
			);
			write(next);
			return next;
		});
	}, []);

	const addQuery = useCallback(
		(query: string) => {
			const value = query.trim();
			if (value) add({ kind: "query", query: value });
		},
		[add],
	);
	const addHit = useCallback(
		(hit: TopHit, sourceQuery?: string) =>
			add({ kind: "hit", hit }, sourceQuery),
		[add],
	);

	return {
		history,
		addQuery,
		addHit,
		remove,
	};
}
