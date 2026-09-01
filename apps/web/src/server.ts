import { env } from "@nanahoshi-v2/env/web";
import handler from "@tanstack/react-start/server-entry";
import {
	getCatalogPreviewTarget,
	isLinkPreviewRequest,
	renderCatalogLinkPreviewHtml,
} from "@/lib/book-link-preview";
import { createServerClient } from "@/lib/server-orpc";
import { paraglideMiddleware } from "@/paraglide/server";

async function catalogLinkPreviewResponse(request: Request) {
	if (!isLinkPreviewRequest(request)) return null;
	const requestUrl = new URL(request.url);
	const target = getCatalogPreviewTarget(requestUrl.pathname);
	if (!target) return null;

	try {
		const client = createServerClient(request.headers.get("cookie") ?? "");
		const preview = await (async () => {
			switch (target.kind) {
				case "book":
					return client.books.getSharePreview({ uuid: target.uuid });
				case "audiobook":
					return client.audiobooks.getSharePreview({ uuid: target.uuid });
				case "ebook-series":
					return client.series.getSharePreview({
						uuid: target.uuid,
						mediaType: "ebook",
					});
				case "audiobook-series":
					return client.series.getSharePreview({
						uuid: target.uuid,
						mediaType: "audiobook",
					});
			}
		})();
		if (!preview) return null;

		const coverFilenames = Array.from(
			new Set(
				(preview.covers ?? [])
					.map((cover) => cover.split("/").pop())
					.filter((cover): cover is string => Boolean(cover)),
			),
		).slice(0, 3);
		const coverFilename = preview.cover?.split("/").pop();
		const isSeries = target.kind.endsWith("series");
		const coverUrl =
			isSeries && coverFilenames.length > 1
				? `${env.VITE_SERVER_URL}/api/share/series/${target.kind === "audiobook-series" ? "audiobook" : "ebook"}/${target.uuid}.jpg?v=${encodeURIComponent(coverFilenames.join(","))}`
				: coverFilename
					? `${env.VITE_SERVER_URL}/api/data/covers/${encodeURIComponent(coverFilename)}?width=1200&quality=85&format=jpeg`
					: null;
		const html = renderCatalogLinkPreviewHtml({
			preview,
			kind: target.kind,
			url: requestUrl.toString(),
			coverUrl,
		});
		return new Response(request.method === "HEAD" ? null : html, {
			headers: {
				"cache-control": "private, no-store",
				"content-type": "text/html; charset=utf-8",
				vary: "user-agent",
			},
		});
	} catch {
		// Preview generation is best-effort. A disabled setting, unavailable API,
		// or missing catalog item falls through to the authenticated application.
		return null;
	}
}

// Custom TanStack Start server entry (used in dev and in the built dist/server
// bundle that apps/web/server.ts serves). paraglideMiddleware resolves the
// request locale from the `locale` cookie and runs the render inside an
// AsyncLocalStorage scope so getLocale() is correct during SSR.
export default {
	async fetch(request: Request): Promise<Response> {
		const previewResponse = await catalogLinkPreviewResponse(request);
		if (previewResponse) return previewResponse;
		return paraglideMiddleware(request, () => handler.fetch(request));
	},
};
