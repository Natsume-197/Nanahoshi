import path from "node:path";

const PORT = Number(process.env.PORT ?? 3000);
const BACKEND_URL = process.env.BACKEND_URL ?? "http://server:3000";
const CLIENT_DIR = "./dist/client";
const SERVER_ENTRY = "./dist/server/server.js";

function getCacheControlHeader(route: string) {
	return route.startsWith("/assets/")
		? "public, max-age=31536000, immutable"
		: "public, max-age=3600";
}

async function createStaticRoutes() {
	const routes: Record<string, Response | (() => Response)> = {};

	for await (const relativePath of new Bun.Glob("**/*").scan({
		cwd: CLIENT_DIR,
		onlyFiles: true,
	})) {
		const filepath = path.join(CLIENT_DIR, relativePath);
		const route = `/${relativePath.split(path.sep).join(path.posix.sep)}`;

		routes[route] = () => {
			const file = Bun.file(filepath);

			return new Response(file, {
				headers: {
					"Content-Type": file.type || "application/octet-stream",
					"Cache-Control": getCacheControlHeader(route),
				},
			});
		};
	}

	return routes;
}

async function proxyToBackend(request: Request) {
	const url = new URL(request.url);
	const targetUrl = `${BACKEND_URL}${url.pathname}${url.search}`;
	try {
		return await fetch(targetUrl, {
			method: request.method,
			headers: request.headers,
			body: request.body,
		});
	} catch {
		return new Response("Backend unavailable", { status: 502 });
	}
}

async function main() {
	const [{ default: handler }, staticRoutes] = await Promise.all([
		import(SERVER_ENTRY) as Promise<{
			default: { fetch: (request: Request) => Response | Promise<Response> };
		}>,
		createStaticRoutes(),
	]);

	Bun.serve({
		port: PORT,
		routes: {
			...staticRoutes,
			"/reader/*": proxyToBackend,
			"/*": (request: Request) => handler.fetch(request),
		},
		error(error) {
			console.error(error);
			return new Response("Internal Server Error", { status: 500 });
		},
	});
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
