import { useEffect } from "react";

/**
 * Wraps useEffect with an empty dependency array to make "run once on mount" intent explicit.
 * This is the only sanctioned way to use useEffect directly in this codebase.
 */
export function useMountEffect(effect: () => void | (() => void)) {
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally empty deps — mount-only effect
	useEffect(effect, []);
}
