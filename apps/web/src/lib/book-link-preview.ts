export interface BookLinkPreview {
	title: string;
	description: string | null;
	cover: string | null;
	authors: string[];
}

const LINK_PREVIEW_USER_AGENT =
	/(?:bot|crawler|spider|preview|unfurl|facebookexternalhit|whatsapp|telegram|slack|discord|twitter|linkedin)/i;

export function getBookUuidFromPath(pathname: string): string | null {
	const match = pathname.match(
		/^\/dashboard\/books\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i,
	);
	return match?.[1] ?? null;
}

export function isLinkPreviewRequest(request: Request): boolean {
	if (request.method !== "GET" && request.method !== "HEAD") return false;
	return LINK_PREVIEW_USER_AGENT.test(request.headers.get("user-agent") ?? "");
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function plainText(value: string): string {
	return value
		.replace(/<br\s*\/?>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#0?39;|&apos;/gi, "'")
		.replace(/\s+/g, " ")
		.trim();
}

function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	const slice = value.slice(0, maxLength - 1);
	const lastSpace = slice.lastIndexOf(" ");
	const end = lastSpace > maxLength / 2 ? lastSpace : slice.length;
	return `${slice.slice(0, end).trimEnd()}…`;
}

export function renderBookLinkPreviewHtml({
	preview,
	url,
	coverUrl,
}: {
	preview: BookLinkPreview;
	url: string;
	coverUrl: string | null;
}): string {
	const title = truncate(preview.title.trim(), 200) || "Nanahoshi";
	const author = preview.authors
		.map((name) => name.trim())
		.filter(Boolean)
		.join(", ");
	const synopsis = plainText(preview.description ?? "");
	const description = truncate(
		[author, synopsis].filter(Boolean).join(" · "),
		300,
	);
	const safeTitle = escapeHtml(title);
	const safeDescription = escapeHtml(description);
	const safeUrl = escapeHtml(url);
	const imageTags = coverUrl
		? `<meta property="og:image" content="${escapeHtml(coverUrl)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${escapeHtml(coverUrl)}">`
		: '<meta name="twitter:card" content="summary">';

	return `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${safeTitle}</title><meta name="description" content="${safeDescription}"><meta property="og:site_name" content="Nanahoshi"><meta property="og:type" content="book"><meta property="og:title" content="${safeTitle}"><meta property="og:description" content="${safeDescription}"><meta property="og:url" content="${safeUrl}"><meta name="twitter:title" content="${safeTitle}"><meta name="twitter:description" content="${safeDescription}">${imageTags}</head><body></body></html>`;
}
