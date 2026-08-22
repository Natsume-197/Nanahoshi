import { useEffect, useMemo, useState } from "react";
import type { Section } from "@/features/reader/document/types";
import {
	type FocusDocument,
	loadFocusDocument,
} from "@/features/reader/renderers/focus/focus-sentences";

/**
 * Owns the indexed text document for a reflowable reading session. It lives
 * above individual layouts, so entering or leaving Focus cannot create a
 * second document lifecycle.
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
	const [document, setDocument] = useState<FocusDocument | null>(null);
	const [error, setError] = useState(false);
	const sectionReferences = useMemo(
		() => sections.map((section) => section.reference).join("\u0000"),
		[sections],
	);

	useEffect(() => {
		if (!enabled) return;
		let cancelled = false;
		const controller = new AbortController();
		setDocument(null);
		setError(false);
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
			.then((parsed) => {
				if (!cancelled) setDocument(parsed);
			})
			.catch((reason: unknown) => {
				if (!cancelled && !controller.signal.aborted) {
					console.error("Failed to prepare text reader document", reason);
					setError(true);
				}
			});
		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [bookUuid, enabled, htmlContent, language, sectionReferences]);

	return { document, error };
}
