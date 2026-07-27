import { useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

/**
 * Subscribe to a media query. For layouts that must *mount* different trees per
 * breakpoint (an inline panel vs. a modal) rather than just restyle one — CSS
 * alone would mount both. Returns false during SSR and the first paint.
 */
export function useMediaQuery(query: string) {
	const [matches, setMatches] = useState(false);

	// One-time external sync to a media query on mount — the sanctioned use of
	// useMountEffect (see CLAUDE.md "No useEffect Rule").
	useMountEffect(() => {
		const mql = window.matchMedia(query);
		const onChange = () => setMatches(mql.matches);
		onChange();
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	});

	return matches;
}
