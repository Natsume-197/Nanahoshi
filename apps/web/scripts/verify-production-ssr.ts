const nativeFetch = globalThis.fetch;
const expectedServerOrigin = "http://internal-api.test:3000";
const expectedSessionUrl = `${expectedServerOrigin}/api/auth/get-session`;
const sessionUrls: string[] = [];
const rpcRequests: Array<{ method: string; url: string }> = [];

process.env.SERVER_URL = expectedServerOrigin;

globalThis.fetch = (input, init) => {
	const url = input instanceof Request ? input.url : String(input);
	if (url.endsWith("/api/auth/get-session")) {
		sessionUrls.push(url);
		return Promise.resolve(Response.json(null));
	}
	if (url.endsWith("/rpc/setup/ssoStatus")) {
		rpcRequests.push({
			method: input instanceof Request ? input.method : (init?.method ?? "GET"),
			url,
		});
		return Promise.resolve(
			Response.json({
				json: {
					configured: false,
					discord: false,
					enabled: false,
					label: "SSO",
					mailer: false,
					providerId: "oidc",
					signup: { discord: false, email: true, policy: "invite-only" },
				},
			}),
		);
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

if (sessionUrls.length !== 1 || sessionUrls[0] !== expectedSessionUrl) {
	throw new Error(
		`SSR session lookup used the wrong destination: expected=${expectedSessionUrl} actual=${sessionUrls.join(",") || "<none>"}`,
	);
}

if (response.status !== 307 || location !== "/login" || body.length !== 0) {
	throw new Error(
		`SSR root redirect is invalid: status=${response.status} location=${location ?? "<none>"} bytes=${body.length}`,
	);
}

const loginResponse = await handler.fetch(
	new Request("http://localhost/login"),
);
const loginBody = await loginResponse.text();
const loginLocation = loginResponse.headers.get("location");
const expectedRpcUrl = `${expectedServerOrigin}/rpc/setup/ssoStatus`;
const rpcRequest = rpcRequests[0];

if (
	rpcRequests.length !== 1 ||
	rpcRequest?.url !== expectedRpcUrl ||
	rpcRequest.method !== "POST"
) {
	throw new Error(
		`SSR ssoStatus lookup used the wrong destination: expected=POST ${expectedRpcUrl} actual=${rpcRequests.map(({ method, url }) => `${method} ${url}`).join(",") || "<none>"}`,
	);
}

if (
	loginResponse.status !== 307 ||
	loginLocation !== "/setup" ||
	loginBody.length !== 0
) {
	throw new Error(
		`SSR login redirect is invalid: status=${loginResponse.status} location=${loginLocation ?? "<none>"} bytes=${loginBody.length}`,
	);
}

console.log(
	"verify-production-ssr: internal auth and ORPC lookups precede empty 307 redirects",
);
