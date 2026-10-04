import { useMountEffect } from "@nanahoshi/ui/hooks/use-mount-effect";
import { useRef } from "react";

type Entry = { dismiss: () => void };
const open: Entry[] = [];
// Popups from the UI kit close on Escape and need no registration.
const POPUPS =
	'[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/** Rendered while a panel is open, so a system Back closes it instead of the book. */
export function BackDismiss({ onDismiss }: { onDismiss: () => void }) {
	const entry = useRef<Entry>({ dismiss: onDismiss });
	entry.current.dismiss = onDismiss;
	useMountEffect(() => {
		const current = entry.current;
		open.push(current);
		return () => {
			const index = open.indexOf(current);
			if (index >= 0) open.splice(index, 1);
		};
	});
	return null;
}

/** Closes the topmost popup or panel; false when nothing is open and Back should leave. */
export function dismissTopOverlay(): boolean {
	if (document.querySelector(POPUPS)) {
		(document.activeElement ?? document.body).dispatchEvent(
			new window.KeyboardEvent("keydown", {
				key: "Escape",
				bubbles: true,
				cancelable: true,
			}),
		);
		return true;
	}
	const top = open.at(-1);
	if (!top) return false;
	top.dismiss();
	return true;
}
