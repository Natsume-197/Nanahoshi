import { useRef } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

/**
 * Runs a callback when the component unmounts.
 * The callback ref is kept current so it always has fresh values.
 */
export function useOnUnmount(callback: () => void) {
	const callbackRef = useRef(callback);
	callbackRef.current = callback;

	useMountEffect(() => {
		return () => callbackRef.current();
	});
}
