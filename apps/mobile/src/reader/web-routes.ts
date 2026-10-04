import type { Href } from "expo-router";

/**
 * The phone screen for a web path the embedded reader links to; null when the
 * app has no equivalent, so the link does nothing rather than open a web page.
 */
export function routeForWebHref(href: string): Href | null {
	const url = new URL(href, "https://app.invalid");
	const [section, kind, uuid] = url.pathname.split("/").filter(Boolean);
	if (section === "reader" && kind)
		return { pathname: "/reader/[uuid]", params: { uuid: kind } };
	if (section !== "dashboard") return null;
	if (kind === "stats") {
		const view = url.searchParams.get("view");
		return {
			pathname: "/stats",
			params: view === "reading" || view === "listening" ? { view } : {},
		};
	}
	if (kind === "books" && uuid)
		return { pathname: "/book/[uuid]", params: { uuid } };
	if (kind === "audiobooks" && uuid)
		return { pathname: "/audiobook/[uuid]", params: { uuid } };
	if (kind === "books" || kind === "audiobooks") return "/catalog";
	return null;
}
