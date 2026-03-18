import { useRef } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

/**
 * Declaratively subscribe to a window event. The handler ref is kept
 * current so the listener never goes stale.
 */
export function useWindowEvent<K extends keyof WindowEventMap>(
	type: K,
	handler: (event: WindowEventMap[K]) => void,
) {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	useMountEffect(() => {
		const listener = (event: WindowEventMap[K]) => handlerRef.current(event);
		window.addEventListener(type, listener);
		return () => window.removeEventListener(type, listener);
	});
}
