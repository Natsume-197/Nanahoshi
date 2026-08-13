import { type ShouldBlockFn, useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useRef } from "react";

type HistoryAction = "PUSH" | "REPLACE" | "FORWARD" | "BACK" | "GO";

export function createOverlayBackStack() {
	const overlays: string[] = [];

	const remove = (id: string) => {
		const index = overlays.lastIndexOf(id);
		if (index !== -1) overlays.splice(index, 1);
	};

	return {
		add(id: string) {
			remove(id);
			overlays.push(id);
		},
		remove,
		consume(action: HistoryAction, id: string) {
			if (action !== "BACK" || overlays.at(-1) !== id) return false;
			remove(id);
			return true;
		},
	};
}

const overlayBackStack = createOverlayBackStack();

/** Lets browser back dismiss the topmost app surface before changing routes. */
export function useOverlayBackDismiss(open: boolean, onDismiss: () => void) {
	const overlayId = useId();
	const onDismissRef = useRef(onDismiss);
	onDismissRef.current = onDismiss;

	useEffect(() => {
		if (!open) return;
		overlayBackStack.add(overlayId);
		return () => overlayBackStack.remove(overlayId);
	}, [open, overlayId]);

	const shouldBlockFn = useCallback<ShouldBlockFn>(
		({ action }) => {
			if (!overlayBackStack.consume(action, overlayId)) return false;
			onDismissRef.current();
			return true;
		},
		[overlayId],
	);

	useBlocker({
		shouldBlockFn,
		disabled: !open,
		enableBeforeUnload: false,
	});
}
