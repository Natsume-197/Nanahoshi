/// <reference lib="webworker" />

/**
 * Offline support. Caches are populated at runtime (TanStack Start's build
 * doesn't expose a precache manifest to a plain public/ worker), so a page
 * becomes available offline after it has been loaded once while the worker
 * controls it — i.e. from the second online visit onwards.
 *
 * Strategies:
 * - hashed build assets (/assets/) → cache-first (immutable)
 * - navigations (HTML)            → network-first, falling back to the cached
 *                                   page, then to the cached app shell ("/")
 * - server functions (/_serverFn) → network-first, falling back to cache, so
 *                                   route loaders (e.g. the reader's getBook)
 *                                   resolve offline for visited pages
 * - Google Fonts                  → stale-while-revalidate
 * - other same-origin GETs        → network-first, falling back to cache
 * - /rpc, /api, /download         → never touched (live data + auth)
 *
 * Book content itself lives in IndexedDB (reader cache), not here.
 */

const VERSION = "v2";
const ASSETS_CACHE = `nanahoshi-assets-${VERSION}`;
const PAGES_CACHE = `nanahoshi-pages-${VERSION}`;
const RUNTIME_CACHE = `nanahoshi-runtime-${VERSION}`;
const FONTS_CACHE = `nanahoshi-fonts-${VERSION}`;
const ACTIVE_CACHES = [ASSETS_CACHE, PAGES_CACHE, RUNTIME_CACHE, FONTS_CACHE];

const PAGES_MAX_ENTRIES = 60;
const RUNTIME_MAX_ENTRIES = 300;

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(PAGES_CACHE)
			.then((cache) => cache.addAll(["/"]))
			.catch(() => {}),
	);
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((names) =>
				Promise.all(
					names
						.filter((name) => !ACTIVE_CACHES.includes(name))
						.map((name) => caches.delete(name)),
				),
			)
			.then(() => self.clients.claim()),
	);
});

async function trimCache(cacheName, maxEntries) {
	const cache = await caches.open(cacheName);
	const keys = await cache.keys();
	for (const key of keys.slice(0, Math.max(0, keys.length - maxEntries))) {
		await cache.delete(key);
	}
}

async function putInCache(cacheName, request, response, maxEntries) {
	// Opaque responses can't be inspected and inflate the quota; skip them.
	if (!response.ok || response.type === "opaque") return;
	const cache = await caches.open(cacheName);
	await cache.put(request, response);
	if (maxEntries) await trimCache(cacheName, maxEntries);
}

async function cacheFirst(request, cacheName) {
	const cached = await caches.match(request, { cacheName });
	if (cached) return cached;
	const response = await fetch(request);
	putInCache(cacheName, request, response.clone());
	return response;
}

async function networkFirst(request, cacheName, maxEntries) {
	try {
		const response = await fetch(request);
		putInCache(cacheName, request, response.clone(), maxEntries);
		return response;
	} catch (error) {
		const cached = await caches.match(request, { cacheName });
		if (cached) return cached;
		throw error;
	}
}

async function handleNavigation(request) {
	try {
		const response = await fetch(request);
		putInCache(PAGES_CACHE, request, response.clone(), PAGES_MAX_ENTRIES);
		return response;
	} catch (error) {
		const cached = await caches.match(request, { cacheName: PAGES_CACHE });
		if (cached) return cached;
		// Unvisited route: boot the cached shell and let the client router
		// resolve it (loaders fall back to cached /_serverFn responses).
		const shell = await caches.match("/", { cacheName: PAGES_CACHE });
		if (shell) return shell;
		throw error;
	}
}

async function staleWhileRevalidate(request, cacheName) {
	const cached = await caches.match(request, { cacheName });
	const refresh = fetch(request)
		.then((response) => {
			putInCache(cacheName, request, response.clone());
			return response;
		})
		.catch(() => undefined);
	return cached ?? (await refresh) ?? fetch(request);
}

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET") return;

	let url;
	try {
		url = new URL(request.url);
	} catch {
		return;
	}
	if (!url.protocol.startsWith("http")) return;

	// Live data and auth — never served from or stored in this cache.
	if (
		url.pathname.startsWith("/rpc") ||
		url.pathname.startsWith("/api") ||
		url.pathname.startsWith("/download")
	) {
		return;
	}

	if (
		url.hostname === "fonts.googleapis.com" ||
		url.hostname === "fonts.gstatic.com"
	) {
		event.respondWith(staleWhileRevalidate(request, FONTS_CACHE));
		return;
	}

	if (url.origin !== self.location.origin) return;

	if (request.mode === "navigate") {
		event.respondWith(handleNavigation(request));
		return;
	}

	if (url.pathname.startsWith("/assets/")) {
		event.respondWith(cacheFirst(request, ASSETS_CACHE));
		return;
	}

	event.respondWith(networkFirst(request, RUNTIME_CACHE, RUNTIME_MAX_ENTRIES));
});
