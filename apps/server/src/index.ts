import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { createContext } from "@nanahoshi-v2/api/context";
import { scheduleBookIndex } from "@nanahoshi-v2/api/infrastructure/queue/jobs/bookIndex.cron";
import { getFileInfo } from "@nanahoshi-v2/api/routers/files/file.service";
import { verifySignature } from "@nanahoshi-v2/api/routers/files/helpers/urlSigner";
import { appRouter } from "@nanahoshi-v2/api/routers/index";
import { auth } from "@nanahoshi-v2/auth";
import { firstSeed } from "@nanahoshi-v2/db/seed/seed";
import { env } from "@nanahoshi-v2/env/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import fs, { createReadStream, statSync } from "fs";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import path from "path";
import sharp from "sharp";

const app = new Hono();

// Queues
import { bookIndexQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/book-index.queue";
import { fileEventQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/file-event.queue";

// Bull Board Setup
const serverAdapter = new HonoAdapter(serveStatic);
createBullBoard({
	queues: [
		new BullMQAdapter(bookIndexQueue),
		new BullMQAdapter(fileEventQueue),
	],
	serverAdapter,
});

const basePath = "/admin/queues/";
serverAdapter.setBasePath(basePath);
app.use("/admin/*", async (c, next) => {
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});
	if (!session?.user || session.user.role !== "admin") {
		return c.text("Unauthorized", 401);
	}
	await next();
});
app.route(basePath, serverAdapter.registerPlugin());

// Serve TTU ebook reader static files at /reader/
const readerBuildDir = path.join(
	__dirname,
	"../../../vendor/ebook-reader/apps/web/build",
);
// Rewrite /reader/manage → /reader/manage.html, /reader/b → /reader/b.html, etc.
app.use("/reader/*", async (c, next) => {
	const reqPath = c.req.path.replace(/^\/reader/, "");
	// If the path has no extension and is not root, try serving .html version
	if (reqPath && reqPath !== "/" && !path.extname(reqPath)) {
		const htmlPath = path.join(readerBuildDir, `${reqPath}.html`);
		try {
			await fs.promises.access(htmlPath);
			const html = await fs.promises.readFile(htmlPath, "utf-8");
			return c.html(html);
		} catch {
			// File doesn't exist, fall through to serveStatic
		}
	}
	await next();
});
app.use(
	"/reader/*",
	serveStatic({
		root: readerBuildDir,
		rewriteRequestPath: (p) => p.replace(/^\/reader/, ""),
	}),
);
// SPA fallback: serve 404.html (SvelteKit adapter-static SPA mode) for unmatched /reader/ routes
app.get("/reader/*", async (c) => {
	const html = await fs.promises.readFile(
		path.join(readerBuildDir, "404.html"),
		"utf-8",
	);
	return c.html(html);
});

app.use(logger());
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

export const apiHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		}),
	],
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

export const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

app.use("/*", async (c, next) => {
	const context = await createContext({ context: c });

	const rpcResult = await rpcHandler.handle(c.req.raw, {
		prefix: "/rpc",
		context: context,
	});

	if (rpcResult.matched) {
		return c.newResponse(rpcResult.response.body, rpcResult.response);
	}

	const apiResult = await apiHandler.handle(c.req.raw, {
		prefix: "/api-reference",
		context: context,
	});

	if (apiResult.matched) {
		return c.newResponse(apiResult.response.body, apiResult.response);
	}

	await next();
});

// Additional routes for development environment
if (env.ENVIRONMENT === "development") {
	app.get("/api/data/covers/:filename", async (c, next) => {
		const { filename } = c.req.param();
		const width = Number(c.req.query("width"));
		const height = Number(c.req.query("height"));

		if (!width && !height) return next();

		const coversDir = path.join(__dirname, "../data/covers");
		const tmpDir = path.join(__dirname, "../data/tmp");
		const imagePath = path.join(coversDir, filename);
		const cacheFile = `${path.basename(filename, ".webp")}-${width || 0}_${height || 0}.webp`;
		const cachePath = path.join(tmpDir, cacheFile);

		await fs.promises.mkdir(tmpDir, { recursive: true });

		try {
			if (!fs.existsSync(cachePath)) {
				await sharp(imagePath)
					.resize(width || undefined, height || undefined, {
						kernel: sharp.kernel.lanczos3,
					})
					.toFile(cachePath);
			}
			const buffer = await fs.promises.readFile(cachePath);
			return c.body(new Uint8Array(buffer), 200, {
				"Content-Type": "image/webp",
			});
		} catch (err) {
			console.error(err);
			return c.text("Error processing image", 500);
		}
	});

	app.use(
		"/api/data/covers/*",
		serveStatic({
			root: path.join(__dirname, "../data/covers"),
			rewriteRequestPath: (p) => p.replace(/^\/api\/data\/covers/, ""),
		}),
	);
}

app.get("/download/:uuid", async (c) => {
	const uuid = c.req.param("uuid");
	const exp = Number(c.req.query("exp"));
	const sig = c.req.query("sig");

	if (!sig || !exp) {
		return c.text("Unauthorized", 401);
	}

	const valid = verifySignature(uuid, exp, sig);
	if (!valid) {
		return c.text("Invalid or expired link", 403);
	}

	const file = await getFileInfo(uuid);
	if (!file) {
		return c.text("Not found", 404);
	}

	// TODO: check user permissions for download
	/*
	const ctx = await createContext({ context: c });
	console.log(ctx)

	if (file.userId !== ctx.user?.id) {
		return c.text("Forbidden", 403);
	}*/

	console.log(file);

	try {
		const stats = statSync(file.fullPath);
		const stream = createReadStream(file.fullPath);

		return c.body(stream, 200, {
			"Content-Length": stats.size.toString(),
			"Content-Type": file.mimetype,
			"Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
		});
	} catch (error) {
		console.log(error);
		return c.text("File missing on disk", 404);
	}
});

app.get("/", (c) => {
	return c.text("OK");
});

// First steps
await firstSeed();
import "@nanahoshi-v2/api/infrastructure/workers/file.event.worker";
import "@nanahoshi-v2/api/infrastructure/workers/book.index.worker";
scheduleBookIndex();

export default app;
