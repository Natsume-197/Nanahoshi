import DOMPurify, { type Config } from "dompurify";

/**
 * The profile both sanitizers share. The default DOMPurify profile keeps
 * everything the nanahoshi-parity reader relies on — HTML + SVG (cover images),
 * ruby/rt/rp (furigana), inline `style`, and `data-*` attributes — while
 * stripping script/handler/`javascript:` vectors. `epub:type` is preserved
 * since some EPUB structural styling keys off it.
 */
const CONFIG: Config = {
	ADD_ATTR: ["epub:type"],
	// DOMPurify's default URI allowlist drops `blob:`, but book images are
	// injected as blob: object URLs by getHtmlWithImageSource — without this
	// every image would lose its src. blob: URLs are same-origin, page-created
	// references, so they're safe to allow; javascript:/vbscript: stay blocked.
	// (Default schemes + blob.)
	ALLOWED_URI_REGEXP:
		/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

/**
 * Sanitize untrusted book/EPUB HTML before it is injected into the live app DOM
 * via `innerHTML`. Book files are attacker-controlled (any user can upload one),
 * so a malicious book must not be able to run `<script>`, inline event handlers
 * (`onerror`/`onload`/…), or `javascript:` URLs in the app's own origin.
 *
 * No-ops during SSR (no `window`); the reader only injects content client-side.
 */
export function sanitizeBookHtml(html: string): string {
	if (typeof window === "undefined") return html;
	return DOMPurify.sanitize(html, { ...CONFIG, RETURN_TRUSTED_TYPE: false });
}

/**
 * Same guarantees as sanitizeBookHtml, but hands back the parsed nodes instead
 * of a string. DOMPurify already builds a DOM internally, so taking the
 * fragment skips its serialize plus the caller's re-parse of the whole book.
 */
export function sanitizeBookHtmlToFragment(html: string): DocumentFragment {
	return DOMPurify.sanitize(html, {
		...CONFIG,
		RETURN_DOM_FRAGMENT: true,
	});
}

/**
 * Sanitize freshly parsed book HTML in place, before it is cached, so that
 * opening the cached copy doesn't have to run DOMPurify over the whole book
 * again. Callers must record BOOK_SANITIZE_VERSION alongside the result.
 *
 * Packed images are still `nanahoshi:`/dummy-data-URI references at this point (the
 * blob: object URLs only exist per-open), so the internal `nanahoshi:` scheme is
 * allowed here — it is resolved to a same-origin blob URL by
 * getHtmlWithImageSource and never reaches the network. javascript:/vbscript:
 * stay blocked exactly as in the read-time profile.
 */
export function sanitizeStoredBookHtml(element: HTMLElement): HTMLElement {
	if (typeof window === "undefined") return element;
	DOMPurify.sanitize(element, {
		...CONFIG,
		ALLOWED_URI_REGEXP:
			/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data|blob|Nanahoshi):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
		IN_PLACE: true,
	});
	return element;
}
