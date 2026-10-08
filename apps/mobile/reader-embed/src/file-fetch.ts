/**
 * fetch() rejects file: URLs, and the page's wasm (pdfium, 7z) now sits
 * beside it as files rather than inlined as data: URLs. Their loaders fetch
 * the wasm, in the page and in pdfium's workers, so both get a fetch that
 * reads file: URLs through XMLHttpRequest, which the WebView allows.
 */
function installFileFetch() {
	const nativeFetch = self.fetch.bind(self);
	self.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.href
					: input.url;
		if (!url.startsWith("file:")) return nativeFetch(input, init);
		return new Promise<Response>((resolve, reject) => {
			const request = new XMLHttpRequest();
			request.open("GET", url);
			request.responseType = "arraybuffer";
			request.onload = () =>
				resolve(
					new Response(request.response, {
						status: 200,
						headers: {
							"Content-Type": url.endsWith(".wasm")
								? "application/wasm"
								: "application/octet-stream",
						},
					}),
				);
			request.onerror = () => reject(new TypeError(`Failed to load ${url}`));
			request.send();
		});
	}) as typeof fetch;
}

installFileFetch();

// Workers start with the native fetch: each one runs the same patch first.
const PATCH = `(${installFileFetch.toString()})();`;
const scriptUrl = (code: string) =>
	URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
const patchModule = scriptUrl(PATCH);
const NativeWorker = self.Worker;
self.Worker = class extends NativeWorker {
	constructor(url: string | URL, options?: WorkerOptions) {
		const script = JSON.stringify(new URL(url, location.href).href);
		// Static imports run in order, before the worker takes any message.
		const start =
			options?.type === "module"
				? `import ${JSON.stringify(patchModule)};\nimport ${script};`
				: `${PATCH}\nimportScripts(${script});`;
		super(scriptUrl(start), options);
	}
};
