import { useCallback, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import {
	applyRadius,
	getStoredRadius,
	readEffectiveRadius,
	storeRadius,
} from "@/lib/theme-radius";

/** SSR has no storage and no computed styles; the real value lands on mount. */
const SSR_RADIUS = 0.5;

export function useCornerRadius() {
	const [radius, setRadiusState] = useState<number>(SSR_RADIUS);
	const [isOverridden, setIsOverridden] = useState(false);

	useMountEffect(() => {
		const stored = getStoredRadius();
		setIsOverridden(stored !== null);
		setRadiusState(stored ?? readEffectiveRadius(SSR_RADIUS));
	});

	const setRadius = useCallback((next: number) => {
		setRadiusState(next);
		setIsOverridden(true);
		storeRadius(next);
		applyRadius(next);
	}, []);

	/** Drop the override so the active theme's own radius applies again. */
	const resetRadius = useCallback(() => {
		storeRadius(null);
		applyRadius(null);
		setIsOverridden(false);
		setRadiusState(readEffectiveRadius(SSR_RADIUS));
	}, []);

	return { radius, isOverridden, setRadius, resetRadius } as const;
}
