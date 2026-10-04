const READER_OVERLAY_SELECTOR =
	'[role="dialog"],[data-slot="drawer-popup"],[data-reader-overlay]';

/** True when an input event originated in reader chrome rather than the book. */
export function isReaderOverlayEvent(event: Event) {
	return event
		.composedPath()
		.some(
			(target) =>
				target instanceof Element &&
				Boolean(target.closest(READER_OVERLAY_SELECTOR)),
		);
}
