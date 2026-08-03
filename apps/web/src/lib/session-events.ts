export const SESSION_UNAUTHORIZED_EVENT = "nanahoshi:session-unauthorized";

declare global {
	interface WindowEventMap {
		"nanahoshi:session-unauthorized": Event;
	}
}

/** Notify the authenticated UI that the server rejected its session. */
export function notifySessionUnauthorized() {
	if (typeof window !== "undefined") {
		window.dispatchEvent(new window.Event(SESSION_UNAUTHORIZED_EVENT));
	}
}
