export const FOCUS_SENTENCE_NAVIGATION_EVENT =
	"nanahoshi:focus-sentence-navigation";

export type FocusSentenceNavigationDetail = {
	character: number;
	direction: -1 | 1;
};

/** Announces a user-driven Focus page change without coupling the reader to audio. */
export function announceFocusSentenceNavigation(
	surface: HTMLElement,
	detail: FocusSentenceNavigationDetail,
) {
	const CustomEventConstructor = surface.ownerDocument.defaultView?.CustomEvent;
	if (!CustomEventConstructor) return;
	surface.dispatchEvent(
		new CustomEventConstructor<FocusSentenceNavigationDetail>(
			FOCUS_SENTENCE_NAVIGATION_EVENT,
			{ bubbles: true, detail },
		),
	);
}
