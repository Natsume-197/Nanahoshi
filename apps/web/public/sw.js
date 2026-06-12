/// <reference lib="webworker" />

/**
 * Offline support. Strategies:
 * - /assets/ (hashed)        → cache-first, precached at install in prod
 * - navigations (HTML)       → network-first → cached page → app shell ("/")
 * - /_serverFn               → network-first → cache (route loaders offline)
 * - Google Fonts             → stale-while-revalidate
 * - /api/data/covers         → stale-while-revalidate
 * - auth read GET allowlist  → network-first → cache
 * - /rpc, rest of /api, /download → untouched (live data + auth writes)
 *
 * Book content lives in IndexedDB (reader cache), not here.
 */

try {
	importScripts("/sw-precache.js");
} catch {
	self.__PRECACHE_MANIFEST = [];
}
const PRECACHE_MANIFEST = self.__PRECACHE_MANIFEST || [];

const VERSION = "v5";
const ASSETS_CACHE = `nanahoshi-assets-${VERSION}`;
const PAGES_CACHE = `nanahoshi-pages-${VERSION}`;
const RUNTIME_CACHE = `nanahoshi-runtime-${VERSION}`;
const FONTS_CACHE = `nanahoshi-fonts-${VERSION}`;
const COVERS_CACHE = `nanahoshi-covers-${VERSION}`;
const ACTIVE_CACHES = [
	ASSETS_CACHE,
	PAGES_CACHE,
	RUNTIME_CACHE,
	FONTS_CACHE,
	COVERS_CACHE,
];

const PAGES_MAX_ENTRIES = 60;
const RUNTIME_MAX_ENTRIES = 300;
const COVERS_MAX_ENTRIES = 400;

// Read-only better-auth endpoints; tokens/sign-in must never hit Cache Storage.
const AUTH_READ_PATHS = new Set([
	"/api/auth/get-session",
	"/api/auth/organization/list",
	"/api/auth/organization/get-full-organization",
]);

async function cacheShell() {
	const response = await fetch("/");
	if (!response.ok) return;
	const clean = response.redirected
		? new Response(await response.blob(), {
				status: response.status,
				statusText: response.statusText,
				headers: response.headers,
			})
		: response;
	const cache = await caches.open(PAGES_CACHE);
	await cache.put("/", clean);
}

self.addEventListener("install", (event) => {
	event.waitUntil(
		Promise.all([
			cacheShell(),
			PRECACHE_MANIFEST.length
				? caches
						.open(ASSETS_CACHE)
						.then((cache) => cache.addAll(PRECACHE_MANIFEST))
				: Promise.resolve(),
		]).catch(() => {}),
	);
	self.skipWaiting();
});

async function pruneStaleAssets() {
	if (!PRECACHE_MANIFEST.length) return;
	const expected = new Set(
		PRECACHE_MANIFEST.map((p) => new URL(p, self.location.origin).href),
	);
	const cache = await caches.open(ASSETS_CACHE);
	for (const request of await cache.keys()) {
		const { pathname } = new URL(request.url);
		if (pathname.startsWith("/assets/") && !expected.has(request.url)) {
			await cache.delete(request);
		}
	}
}

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
			.then(() => pruneStaleAssets())
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
	// opaque responses inflate the quota and can't be inspected
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
		// unvisited route: serve the shell, the client router resolves it
		const shell = await caches.match("/", { cacheName: PAGES_CACHE });
		if (shell) return shell;
		throw error;
	}
}

async function staleWhileRevalidate(request, cacheName, maxEntries) {
	const cached = await caches.match(request, { cacheName });
	const refresh = fetch(request)
		.then((response) => {
			putInCache(cacheName, request, response.clone(), maxEntries);
			return response;
		})
		.catch(() => undefined);
	return cached ?? (await refresh) ?? fetch(request);
}

// <img> requests are no-cors (opaque, uncacheable) — refetch in cors mode.
async function coverStrategy(request) {
	const cached = await caches.match(request.url, { cacheName: COVERS_CACHE });
	const refresh = fetch(request.url, { mode: "cors", credentials: "omit" })
		.then((response) => {
			putInCache(
				COVERS_CACHE,
				request.url,
				response.clone(),
				COVERS_MAX_ENTRIES,
			);
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

	if (url.pathname.startsWith("/api/data/covers/")) {
		event.respondWith(coverStrategy(request));
		return;
	}

	// before the same-origin gate: the API server is a separate origin in dev
	if (AUTH_READ_PATHS.has(url.pathname)) {
		event.respondWith(
			networkFirst(request, RUNTIME_CACHE, RUNTIME_MAX_ENTRIES),
		);
		return;
	}

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
