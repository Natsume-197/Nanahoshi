import { type EffectCallback, useEffect } from "react";

/**
 * The one sanctioned useEffect (same rule as apps/web — see AGENTS.md):
 * setup/cleanup of an external system on mount. Anything that reacts to a
 * changing value is derived during render, handled in an event, or reset with
 * a `key` instead.
 */
export function useMountEffect(effect: EffectCallback) {
	// biome-ignore lint/correctness/useExhaustiveDependencies: mount-only by design
	useEffect(effect, []);
}
