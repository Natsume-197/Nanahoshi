/// <reference lib="webworker" />

const CACHE_NAME = "nanahoshi-v1";

// Install: cache app shell
self.addEventListener("install", () => {
	self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((names) =>
				Promise.all(
					names
						.filter((name) => name !== CACHE_NAME)
						.map((name) => caches.delete(name)),
				),
			),
	);
	self.clients.claim();
});

// Fetch: network-first strategy
self.addEventListener("fetch", (event) => {
	const { request } = event;

	// Skip non-GET requests and chrome-extension
	if (request.method !== "GET") return;
	if (request.url.startsWith("chrome-extension://")) return;

	// Skip API/RPC/auth calls - always go to network
	const url = new URL(request.url);
	if (
		url.pathname.startsWith("/rpc") ||
		url.pathname.startsWith("/api") ||
		url.pathname.startsWith("/download")
	) {
		return;
	}

	event.respondWith(
		fetch(request)
			.then((response) => {
				// Cache successful responses for static assets
				if (
					response.ok &&
					(url.pathname.match(/\.(js|css|png|svg|woff2|ico)$/) ||
						url.pathname === "/manifest.webmanifest")
				) {
					const clone = response.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
				}
				return response;
			})
			.catch(() => caches.match(request)),
	);
});
