import path from "node:path";

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_DIR = "./dist/client";
const SERVER_ENTRY = "./dist/server/server.js";

// Bun.serve does not compress responses, so static text assets are served from
// .br/.gz siblings written by scripts/precompress-assets.ts, and dynamic (SSR)
// responses are gzipped on the fly below.
const COMPRESSIBLE = /\.(js|css|html|svg|json|webmanifest|txt|xml|map)$/;
const COMPRESSIBLE_TYPES =
	/^(?:text\/(?!event-stream)|application\/(?:json|javascript|xml)|image\/svg)/;

function getCacheControlHeader(route: string) {
	return route.startsWith("/assets/")
		? "public, max-age=31536000, immutable"
		: "public, max-age=3600";
}

function pickStaticEncoding(
	request: Request,
	variants: Set<string>,
	filepath: string,
): { filepath: string; encoding: string } | null {
	const accepted = request.headers.get("accept-encoding") ?? "";
	if (/\bbr\b/.test(accepted) && variants.has(`${filepath}.br`)) {
		return { filepath: `${filepath}.br`, encoding: "br" };
	}
	if (/\bgzip\b/.test(accepted) && variants.has(`${filepath}.gz`)) {
		return { filepath: `${filepath}.gz`, encoding: "gzip" };
	}
	return null;
}

async function createStaticRoutes() {
	const files = new Set<string>();
	for await (const relativePath of new Bun.Glob("**/*").scan({
		cwd: CLIENT_DIR,
		onlyFiles: true,
	})) {
		files.add(path.join(CLIENT_DIR, relativePath));
	}

	const routes: Record<string, (request: Request) => Response> = {};
	for (const filepath of files) {
		// Precompressed siblings are variants of their base route, not routes.
		if (filepath.endsWith(".br") || filepath.endsWith(".gz")) continue;

		const route = `/${path
			.relative(CLIENT_DIR, filepath)
			.split(path.sep)
			.join(path.posix.sep)}`;
		const contentType = Bun.file(filepath).type || "application/octet-stream";
		const compressible = COMPRESSIBLE.test(filepath);

		routes[route] = (request: Request) => {
			const headers: Record<string, string> = {
				"Content-Type": contentType,
				"Cache-Control": getCacheControlHeader(route),
			};
			let servePath = filepath;
			if (compressible) {
				headers.Vary = "Accept-Encoding";
				const picked = pickStaticEncoding(request, files, filepath);
				if (picked) {
					servePath = picked.filepath;
					headers["Content-Encoding"] = picked.encoding;
				}
			}
			return new Response(Bun.file(servePath), { headers });
		};
	}

	return routes;
}

/** Gzip dynamic responses (SSR HTML, server functions) without buffering. */
function compressDynamicResponse(
	request: Request,
	response: Response,
): Response {
	if (request.method === "HEAD" || !response.body) return response;
	if (response.status === 204 || response.status === 304) return response;
	if (response.headers.has("content-encoding")) return response;
	const type = response.headers.get("content-type") ?? "";
	if (!COMPRESSIBLE_TYPES.test(type)) return response;
	const accepted = request.headers.get("accept-encoding") ?? "";
	if (!/\bgzip\b/.test(accepted)) return response;

	const headers = new Headers(response.headers);
	headers.delete("content-length");
	headers.set("content-encoding", "gzip");
	if (!/accept-encoding/i.test(headers.get("vary") ?? "")) {
		headers.append("vary", "Accept-Encoding");
	}
	return new Response(
		response.body.pipeThrough(new CompressionStream("gzip")),
		{ status: response.status, statusText: response.statusText, headers },
	);
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
			"/*": async (request: Request) =>
				compressDynamicResponse(request, await handler.fetch(request)),
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
