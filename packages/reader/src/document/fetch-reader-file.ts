/** fetch() rejects file: URLs, which is where the mobile app keeps downloaded books. */
export function fetchReaderFile(
	url: string,
	signal?: AbortSignal,
): Promise<Response> {
	if (!url.startsWith("file:"))
		return fetch(url, { credentials: "include", signal });
	return new Promise((resolve, reject) => {
		signal?.throwIfAborted();
		const request = new XMLHttpRequest();
		request.open("GET", url);
		request.responseType = "blob";
		request.onload = () => {
			const blob = request.response as Blob | null;
			// A missing file loads as an empty body with status 0, not an error.
			if (!blob?.size) {
				reject(new Error(`The book file is missing: ${url}`));
				return;
			}
			resolve(
				new Response(blob, {
					headers: { "Content-Length": String(blob.size) },
				}),
			);
		};
		request.onerror = () => reject(new Error(`Could not read ${url}`));
		signal?.addEventListener(
			"abort",
			() => {
				request.abort();
				reject(signal.reason);
			},
			{ once: true },
		);
		request.send();
	});
}
