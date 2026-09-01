import { env } from "@nanahoshi-v2/env/web";
import handler from "@tanstack/react-start/server-entry";
import {
	getBookUuidFromPath,
	isLinkPreviewRequest,
	renderBookLinkPreviewHtml,
} from "@/lib/book-link-preview";
import { createServerClient } from "@/lib/server-orpc";
import { paraglideMiddleware } from "@/paraglide/server";

async function bookLinkPreviewResponse(request: Request) {
	if (!isLinkPreviewRequest(request)) return null;
	const requestUrl = new URL(request.url);
	const uuid = getBookUuidFromPath(requestUrl.pathname);
	if (!uuid) return null;

	try {
		const client = createServerClient(request.headers.get("cookie") ?? "");
		const preview = await client.books.getSharePreview({ uuid });
		if (!preview) return null;

		const coverFilename = preview.cover?.split("/").pop();
		const coverUrl = coverFilename
			? `${env.VITE_SERVER_URL}/api/data/covers/${encodeURIComponent(coverFilename)}?width=1200&quality=85&format=jpeg`
			: null;
		const html = renderBookLinkPreviewHtml({
			preview,
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
		// or missing book falls through to the normal authenticated application.
		return null;
	}
}

// Custom TanStack Start server entry (used in dev and in the built dist/server
// bundle that apps/web/server.ts serves). paraglideMiddleware resolves the
// request locale from the `locale` cookie and runs the render inside an
// AsyncLocalStorage scope so getLocale() is correct during SSR.
export default {
	async fetch(request: Request): Promise<Response> {
		const previewResponse = await bookLinkPreviewResponse(request);
		if (previewResponse) return previewResponse;
		return paraglideMiddleware(request, () => handler.fetch(request));
	},
};
