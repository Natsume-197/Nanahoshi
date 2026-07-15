import { useSyncExternalStore } from "react";

/** Which reader engine opens when reading a book. */
export type ReaderEngine = "ttu" | "lumi";

const READER_ENGINE_KEY = "nanahoshi-reader-engine";

/** URL path segments of the reader routes, one per engine. */
export const READER_ROUTE_SEGMENTS: ReadonlySet<string> = new Set([
	"reader",
	"lumi-reader",
]);

/** Read the persisted engine, defaulting to "ttu" (and on the server). */
function readStored(): ReaderEngine {
	if (typeof window === "undefined") return "ttu";
	return window.localStorage.getItem(READER_ENGINE_KEY) === "lumi"
		? "lumi"
		: "ttu";
}

let engine: ReaderEngine = readStored();
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

/** Persist and broadcast the chosen engine. */
export function setReaderEngine(next: ReaderEngine) {
	if (engine === next) return;
	engine = next;
	if (typeof window !== "undefined") {
		window.localStorage.setItem(READER_ENGINE_KEY, next);
	}
	emit();
}

function subscribe(onStoreChange: () => void) {
	listeners.add(onStoreChange);
	return () => {
		listeners.delete(onStoreChange);
	};
}

/** The current reader engine. */
export function useReaderEngine(): ReaderEngine {
	return useSyncExternalStore(
		subscribe,
		() => engine,
		() => "ttu",
	);
}

/** The reader route for the chosen engine, for a `<Link to>`. */
export function useReaderRouteTo(): "/reader/$uuid" | "/lumi-reader/$uuid" {
	return useReaderEngine() === "lumi" ? "/lumi-reader/$uuid" : "/reader/$uuid";
}
