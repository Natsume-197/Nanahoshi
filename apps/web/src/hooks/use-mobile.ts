import { useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
	const [isMobile, setIsMobile] = useState<boolean | undefined>(undefined);

	// One-time external sync to a media query on mount — the sanctioned use of
	// useMountEffect (see CLAUDE.md "No useEffect Rule").
	useMountEffect(() => {
		const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
		const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
		onChange();
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	});

	return !!isMobile;
}
