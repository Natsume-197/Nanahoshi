import { type ShouldBlockFn, useBlocker } from "@tanstack/react-router";
import { createElement, useCallback, useId, useRef } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

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
	return open
		? createElement(OverlayBackRegistration, { key: overlayId, overlayId })
		: null;
}

function OverlayBackRegistration({ overlayId }: { overlayId: string }) {
	useMountEffect(() => {
		overlayBackStack.add(overlayId);
		return () => overlayBackStack.remove(overlayId);
	});
	return null;
}
