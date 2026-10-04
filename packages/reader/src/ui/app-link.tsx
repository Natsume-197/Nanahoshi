import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { readerHost } from "../host/reader-host";

/**
 * A link to one of the app's pages. A real anchor, so the web keeps new-tab
 * clicks; a plain click is handed to the app, which navigates its own way.
 */
export function AppLink({
	href,
	onClick,
	...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
	const open = (event: MouseEvent<HTMLAnchorElement>) => {
		onClick?.(event);
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		)
			return;
		event.preventDefault();
		readerHost().openAppRoute(href);
	};
	return <a href={href} onClick={open} {...props} />;
}
