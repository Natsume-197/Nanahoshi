const nativeFetch = globalThis.fetch;

globalThis.fetch = (input, init) => {
	const url = input instanceof Request ? input.url : String(input);
	if (url.endsWith("/api/auth/get-session")) {
		return Promise.resolve(Response.json(null));
	}
	return nativeFetch(input, init);
};

const { default: handler } = (await import("../dist/server/server.js")) as {
	default: {
		fetch: (request: Request) => Response | Promise<Response>;
	};
};

const response = await handler.fetch(new Request("http://localhost/"));
const body = await response.text();
const location = response.headers.get("location");

if (response.status !== 307 || location !== "/login" || body.length !== 0) {
	throw new Error(
		`SSR root redirect is invalid: status=${response.status} location=${location ?? "<none>"} bytes=${body.length}`,
	);
}

console.log(
	"verify-production-ssr: / redirects to /login with an empty 307 response",
);
