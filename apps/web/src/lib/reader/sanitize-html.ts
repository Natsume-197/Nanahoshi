import DOMPurify from "dompurify";

/**
 * Sanitize untrusted book/EPUB HTML before it is injected into the live app DOM
 * via `innerHTML`. Book files are attacker-controlled (any user can upload one),
 * so a malicious book must not be able to run `<script>`, inline event handlers
 * (`onerror`/`onload`/…), or `javascript:` URLs in the app's own origin.
 *
 * The default DOMPurify profile keeps everything the ttu-parity reader relies on
 * — HTML + SVG (cover images), ruby/rt/rp (furigana), inline `style`, and `data-*`
 * attributes — while stripping the XSS vectors above. `epub:type` is preserved
 * since some EPUB structural styling keys off it.
 *
 * No-ops during SSR (no `window`); the reader only injects content client-side.
 */
export function sanitizeBookHtml(html: string): string {
	if (typeof window === "undefined") return html;
	return DOMPurify.sanitize(html, {
		ADD_ATTR: ["epub:type"],
		// DOMPurify's default URI allowlist drops `blob:`, but book images are
		// injected as blob: object URLs by getHtmlWithImageSource — without this
		// every <img>/<image> would lose its src. blob: URLs are same-origin,
		// page-created references, so they're safe to allow; javascript:/vbscript:
		// stay blocked. (Default schemes + blob.)
		ALLOWED_URI_REGEXP:
			/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
	});
}
