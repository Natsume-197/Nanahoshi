import { useRef } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

/**
 * Declaratively subscribe to a document event. The handler ref is kept
 * current so the listener never goes stale.
 */
export function useDocumentEvent<K extends keyof DocumentEventMap>(
	type: K,
	handler: (event: DocumentEventMap[K]) => void,
) {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	useMountEffect(() => {
		const listener = (event: DocumentEventMap[K]) =>
			handlerRef.current(event);
		document.addEventListener(type, listener);
		return () => document.removeEventListener(type, listener);
	});
}
