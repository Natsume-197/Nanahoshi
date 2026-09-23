import { useMemo, useSyncExternalStore } from "react";
import type { Section } from "@/features/reader/document/types";
import {
	type FocusDocument,
	loadFocusDocument,
} from "@/features/reader/renderers/focus/focus-sentences";

/**
 * Owns the indexed text document for a reflowable reading session. It lives
 * above individual layouts and prepares on demand for Focus. Other layouts
 * do not pay for sentence indexing; completed indexes remain cached.
 */
export function useTextReaderDocument({
	enabled,
	bookUuid,
	htmlContent,
	language,
	sections,
}: {
	enabled: boolean;
	bookUuid: string;
	htmlContent: string;
	language: string;
	sections: readonly Section[];
}) {
	const sectionReferences = useMemo(
		() => sections.map((section) => section.reference).join("\u0000"),
		[sections],
	);

	const store = useMemo(() => {
		const initial = { document: null as FocusDocument | null, error: false };
		let state = initial;
		return {
			getSnapshot: () => state,
			getServerSnapshot: () => initial,
			subscribe(notify: () => void) {
				if (!enabled) return () => {};
				const controller = new AbortController();
				void loadFocusDocument({
					cacheKey: bookUuid,
					htmlContent,
					language,
					document: window.document,
					sectionReferences: sectionReferences
						? sectionReferences.split("\u0000")
						: [],
					signal: controller.signal,
				})
					.then((document) => {
						if (controller.signal.aborted) return;
						state = { document, error: false };
						notify();
					})
					.catch((reason) => {
						if (controller.signal.aborted) return;
						console.error("Failed to prepare text reader document", reason);
						state = { document: null, error: true };
						notify();
					});
				return () => controller.abort();
			},
		};
	}, [bookUuid, enabled, htmlContent, language, sectionReferences]);
	return useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getServerSnapshot,
	);
}
