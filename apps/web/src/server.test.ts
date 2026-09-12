import { expect, mock, test } from "bun:test";

mock.module("@nanahoshi-v2/env/web", () => ({
	env: { VITE_SERVER_URL: "https://api.example" },
}));
mock.module("@tanstack/react-start/server-entry", () => ({
	default: { fetch: () => new Response("Application") },
}));
mock.module("@/paraglide/server", () => ({
	paraglideMiddleware: (_request: Request, next: () => Response) => next(),
}));
mock.module("@/lib/server-orpc", () => ({
	createServerClient: () => ({
		collections: {
			getSharePreview: async () => ({
				title: "Public collection",
				description: null,
				authors: ["@reader"],
				cover: null,
			}),
		},
	}),
}));

const { default: server } = await import("./server");
const pathname = "/dashboard/collections/258c3a0a-9d3e-47b3-979f-62c412f6aa9c";

for (const userAgent of ["Discordbot/2.0", "WhatsApp/2.24"]) {
	test(`${userAgent} receives HTTPS canonical and Open Graph URLs behind a proxy`, async () => {
		const response = await server.fetch(
			new Request(`http://library.example${pathname}?tracking=1`, {
				headers: { "user-agent": userAgent, "x-forwarded-proto": "https" },
			}),
		);
		const html = await response.text();
		expect(response.status).toBe(200);
		expect(html).toContain(
			`property="og:url" content="https://library.example${pathname}"`,
		);
		expect(html).toContain(
			`rel="canonical" href="https://library.example${pathname}"`,
		);
	});
}

test("direct HTTP development requests keep their original scheme", async () => {
	const response = await server.fetch(
		new Request(`http://localhost:3001${pathname}`, {
			headers: { "user-agent": "Discordbot/2.0" },
		}),
	);
	expect(await response.text()).toContain(
		`property="og:url" content="http://localhost:3001${pathname}"`,
	);
});
