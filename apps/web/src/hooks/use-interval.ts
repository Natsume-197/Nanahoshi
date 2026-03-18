import { useRef } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

/**
 * Runs a callback on a fixed interval. The callback ref is kept current
 * so callers never need to worry about stale closures.
 */
export function useInterval(callback: () => void, ms: number) {
	const callbackRef = useRef(callback);
	callbackRef.current = callback;

	useMountEffect(() => {
		const id = setInterval(() => callbackRef.current(), ms);
		return () => clearInterval(id);
	});
}
