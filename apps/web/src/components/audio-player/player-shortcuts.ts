export type PlayerShortcut =
	| "toggle-play"
	| "seek-back"
	| "seek-forward"
	| "prev-chapter"
	| "next-chapter"
	| "volume-up"
	| "volume-down"
	| "toggle-mute"
	| "toggle-expanded"
	| "collapse";

export interface ShortcutEvent {
	key: string;
	shiftKey?: boolean;
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
	target?: {
		tagName?: string;
		isContentEditable?: boolean;
		closest?: (selector: string) => unknown;
	} | null;
}

const INTERACTIVE_TAGS = new Set([
	"INPUT",
	"TEXTAREA",
	"SELECT",
	"BUTTON",
	"A",
	"SUMMARY",
]);

const INTERACTIVE_ROLES =
	'[role="button"], [role="link"], [role="slider"], [role="switch"], [role="checkbox"], [role="tab"], [role="menu"], [role="menuitem"], [role="dialog"], [role="listbox"], [role="textbox"]';

/** Space activates a focused button, arrows move a slider: those win over us. */
function isOwnedElsewhere(target: ShortcutEvent["target"]): boolean {
	if (!target) return false;
	if (target.isContentEditable) return true;
	if (target.tagName && INTERACTIVE_TAGS.has(target.tagName.toUpperCase()))
		return true;
	return Boolean(target.closest?.(INTERACTIVE_ROLES));
}

export function resolvePlayerShortcut(
	event: ShortcutEvent,
	options: { isExpanded: boolean },
): PlayerShortcut | null {
	if (event.ctrlKey || event.metaKey || event.altKey) return null;
	if (isOwnedElsewhere(event.target)) return null;

	switch (event.key) {
		case " ":
		case "Spacebar":
		case "k":
		case "K":
			return "toggle-play";
		case "ArrowLeft":
			return event.shiftKey ? "prev-chapter" : "seek-back";
		case "ArrowRight":
			return event.shiftKey ? "next-chapter" : "seek-forward";
		case "ArrowUp":
			return "volume-up";
		case "ArrowDown":
			return "volume-down";
		case "m":
		case "M":
			return "toggle-mute";
		case "Escape":
			return options.isExpanded ? "collapse" : null;
		case "f":
		case "F":
			return "toggle-expanded";
		default:
			return null;
	}
}

export const VOLUME_STEP = 0.05;
