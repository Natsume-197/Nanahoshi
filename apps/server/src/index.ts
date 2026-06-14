import fs, { createReadStream, statSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { createContext } from "@nanahoshi-v2/api/context";
import { errorHandlerInterceptor } from "@nanahoshi-v2/api/lib/error-handler";
import { pinoRequestLogger } from "@nanahoshi-v2/api/lib/request-logger";
import { subscribeToTaskUpdates } from "@nanahoshi-v2/api/modules/taskManager";
import {
	getFileInfo,
	getSeriesZipEntries,
} from "@nanahoshi-v2/api/routers/files/file.service";
import {
	createSeriesZipStream,
	seriesZipFilename,
} from "@nanahoshi-v2/api/routers/files/helpers/seriesZip";
import {
	verifySeriesSignature,
	verifySignature,
} from "@nanahoshi-v2/api/routers/files/helpers/urlSigner";
import { appRouter } from "@nanahoshi-v2/api/routers/index";
import {
	parseBasicAuthKey,
	resolveOrgFromApiKey,
} from "@nanahoshi-v2/api/routers/opds/opds.auth";
import { createOpdsApp } from "@nanahoshi-v2/api/routers/opds/opds.routes";
import { auth } from "@nanahoshi-v2/auth";
import { runMigrations } from "@nanahoshi-v2/db/migrate";
import { firstSeed } from "@nanahoshi-v2/db/seed/seed";
import { env } from "@nanahoshi-v2/env/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import sharp from "sharp";

const app = new Hono();

// Hono's types only accept web streams, but Bun's Response handles Node streams.
const asBody = (stream: fs.ReadStream) => stream as unknown as ReadableStream;

// Queues
import { bookIndexQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/book-index.queue";
import { coverColorQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/cover-color.queue";
import { fileEventQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/file-event.queue";
import { metadataEnrichQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/metadata-enrich.queue";
import { ranobedbImportQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/ranobedb-import.queue";
import { searchSyncQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/search-sync.queue";
import { sendToKindleQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/send-to-kindle.queue";

// Bull Board Setup
const serverAdapter = new HonoAdapter(serveStatic);
const bullBoardQueues = [
	new BullMQAdapter(bookIndexQueue, {
		description:
			"Full reindex of all books into the search provider (Elasticsearch only)",
	}),
	new BullMQAdapter(coverColorQueue, {
		description: "Extracts dominant color from book cover images",
	}),
	new BullMQAdapter(fileEventQueue, {
		description:
			"Processes file add/delete events from library scans, creates book records",
	}),
	new BullMQAdapter(metadataEnrichQueue, {
		description: "Enriches book metadata from external providers (Amazon)",
	}),
	new BullMQAdapter(searchSyncQueue, {
		description: "Syncs book data to the search index (Elasticsearch only)",
	}),
	new BullMQAdapter(sendToKindleQueue, {
		description:
			"Sends books to Kindle devices via email, re-converts EPUBs with Calibre",
	}),
	new BullMQAdapter(ranobedbImportQueue, {
		description: "Downloads and imports the RanobeDB database dump",
	}),
];
createBullBoard({
	queues: bullBoardQueues,
	serverAdapter,
});

const basePath = "/admin/queues/";
serverAdapter.setBasePath(basePath);
app.use("/admin/*", async (c, next) => {
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});
	if (session?.user?.role !== "admin") {
		return c.text("Unauthorized", 401);
	}
	await next();
});
app.route(basePath, serverAdapter.registerPlugin());

const avatarsDir = path.join(__dirname, "../data/avatars");
const headersDir = path.join(__dirname, "../data/headers");
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_HEADER_BYTES = 10 * 1024 * 1024;
const MAX_COVER_DIM = 2048;
app.use(
	"/api/data/avatars/*",
	serveStatic({
		root: avatarsDir,
		rewriteRequestPath: (p) => p.replace(/^\/api\/data\/avatars/, ""),
	}),
);
app.use(
	"/api/data/headers/*",
	serveStatic({
		root: headersDir,
		rewriteRequestPath: (p) => p.replace(/^\/api\/data\/headers/, ""),
	}),
);
// OPDS catalog (before CORS — OPDS clients don't send CORS headers)
app.route("/opds", createOpdsApp(auth));

app.use(pinoRequestLogger());
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		exposeHeaders: ["Content-Length"],
		credentials: true,
	}),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.post("/api/profile/avatar", async (c) => {
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

	if (!session?.user) {
		return c.json({ message: "Unauthorized" }, 401);
	}

	const formData = await c.req.formData();
	const file = formData.get("file");

	if (!file || typeof file === "string") {
		return c.json({ message: "Image file is required" }, 400);
	}

	if (!file.type.startsWith("image/")) {
		return c.json({ message: "Please choose a valid image file" }, 400);
	}

	if (file.size > MAX_AVATAR_BYTES) {
		return c.json({ message: "Image must be 5MB or smaller" }, 400);
	}

	await fs.promises.mkdir(avatarsDir, { recursive: true });

	const filename = `${session.user.id}-${Date.now()}.webp`;
	const filePath = path.join(avatarsDir, filename);

	try {
		const buffer = Buffer.from(await file.arrayBuffer());

		await sharp(buffer)
			.rotate()
			.resize(512, 512, {
				fit: "cover",
				position: "attention",
			})
			.webp({ quality: 90, effort: 5 })
			.toFile(filePath);

		return c.json({
			imageUrl: `${env.SERVER_URL}/api/data/avatars/${filename}`,
		});
	} catch (error) {
		console.error(error);
		return c.json({ message: "Failed to process image" }, 500);
	}
});

app.post("/api/profile/header", async (c) => {
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

	if (!session?.user) {
		return c.json({ message: "Unauthorized" }, 401);
	}

	const formData = await c.req.formData();
	const file = formData.get("file");

	if (!file || typeof file === "string") {
		return c.json({ message: "Image file is required" }, 400);
	}

	if (!file.type.startsWith("image/")) {
		return c.json({ message: "Please choose a valid image file" }, 400);
	}

	if (file.size > MAX_HEADER_BYTES) {
		return c.json({ message: "Image must be 10MB or smaller" }, 400);
	}

	await fs.promises.mkdir(headersDir, { recursive: true });

	const filename = `${session.user.id}-${Date.now()}.webp`;
	const filePath = path.join(headersDir, filename);

	try {
		const buffer = Buffer.from(await file.arrayBuffer());

		await sharp(buffer)
			.rotate()
			.resize(1500, 500, {
				fit: "cover",
				position: "attention",
			})
			.webp({ quality: 90, effort: 5 })
			.toFile(filePath);

		return c.json({
			imageUrl: `${env.SERVER_URL}/api/data/headers/${filename}`,
		});
	} catch (error) {
		console.error(error);
		return c.json({ message: "Failed to process image" }, 500);
	}
});

// SSE endpoint for real-time task updates
app.get("/api/tasks/events", async (c) => {
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});
	if (!session?.user) {
		return c.text("Unauthorized", 401);
	}

	return streamSSE(c, async (stream) => {
		let isAborted = false;
		let writeQueue = Promise.resolve();

		const unsubscribe = subscribeToTaskUpdates((task) => {
			if (isAborted) return;
			writeQueue = writeQueue
				.then(() => stream.writeSSE({ data: JSON.stringify(task) }))
				.catch(() => {});
		});

		stream.onAbort(() => {
			isAborted = true;
			unsubscribe();
		});

		// Keep connection alive
		try {
			while (!isAborted) {
				writeQueue = writeQueue
					.then(() => stream.writeSSE({ event: "ping", data: "" }))
					.catch(() => {});
				await stream.sleep(30000);
			}
		} catch (_error) {
			// ignore abort errors
		} finally {
			isAborted = true;
			unsubscribe();
		}
	});
});

export const apiHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		}),
	],
	interceptors: [errorHandlerInterceptor],
});

export const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [errorHandlerInterceptor],
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

// Serve cover images with optional on-the-fly resizing
app.get("/api/data/covers/:filename", async (c, next) => {
	const { filename } = c.req.param();
	const width = Number(c.req.query("width"));
	const height = Number(c.req.query("height"));
	const format = c.req.query("format") === "jpeg" ? "jpeg" : "webp";
	const rawQuality = Number(c.req.query("quality"));
	const quality = Number.isFinite(rawQuality)
		? Math.min(100, Math.max(1, Math.round(rawQuality)))
		: 90;
	const clampDim = (n: number) =>
		Number.isFinite(n) && n > 0 ? Math.min(MAX_COVER_DIM, Math.round(n)) : 0;
	const w = clampDim(width);
	const h = clampDim(height);

	if (!w && !h && format === "webp") return next();

	const coversDir = path.join(__dirname, "../data/covers");

	if (
		filename.includes("/") ||
		filename.includes("\\") ||
		filename.includes("\0")
	) {
		return c.text("Invalid filename", 400);
	}
	const imagePath = path.join(coversDir, filename);
	const resolved = path.resolve(imagePath);
	if (
		resolved !== imagePath ||
		!resolved.startsWith(path.resolve(coversDir) + path.sep)
	) {
		return c.text("Invalid filename", 400);
	}

	const tmpDir = path.join(__dirname, "../data/tmp");
	const cacheFile = `${path.basename(filename, ".webp")}-${w || 0}_${h || 0}_q${quality}_v2.${format}`;
	const cachePath = path.join(tmpDir, cacheFile);
	const contentType = format === "jpeg" ? "image/jpeg" : "image/webp";

	await fs.promises.mkdir(tmpDir, { recursive: true });

	try {
		if (!fs.existsSync(cachePath)) {
			let pipeline = sharp(imagePath);
			if (w || h) {
				pipeline = pipeline.resize(w || undefined, h || undefined, {
					kernel: sharp.kernel.lanczos3,
					fit: "inside",
					withoutEnlargement: true,
				});
			}
			if (format === "jpeg") {
				pipeline = pipeline.jpeg({ quality });
			} else {
				pipeline = pipeline.webp({ quality, effort: 5, smartSubsample: true });
			}
			await pipeline.toFile(cachePath);
		}
		const buffer = await fs.promises.readFile(cachePath);
		return c.body(new Uint8Array(buffer), 200, {
			"Content-Type": contentType,
			"Cache-Control": "public, max-age=31536000, immutable",
		});
	} catch (err) {
		console.error(err);
		return c.text("Error processing image", 500);
	}
});

app.use("/api/data/covers/*", async (c, next) => {
	await next();
	if (c.res.ok) {
		c.res.headers.set("Cache-Control", "public, max-age=86400");
	}
});
app.use(
	"/api/data/covers/*",
	serveStatic({
		root: path.join(__dirname, "../data/covers"),
		rewriteRequestPath: (p) => p.replace(/^\/api\/data\/covers/, ""),
	}),
);

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

	// Try Basic Auth first (OPDS clients), then fall back to cookie-based session
	let organizationId: string | undefined;
	const apiKey = parseBasicAuthKey(c.req.header("Authorization"));
	if (apiKey) {
		try {
			const user = await resolveOrgFromApiKey(auth, apiKey);
			organizationId = user?.organizationId;
		} catch {
			// Invalid API key, continue
		}
	}

	if (!organizationId) {
		const ctx = await createContext({ context: c });
		if (ctx.session?.user) {
			organizationId = ctx.session.session.activeOrganizationId ?? undefined;
		}
	}

	if (!organizationId) {
		return c.text("Unauthorized", 401);
	}

	const file = await getFileInfo(uuid, organizationId);
	if (!file) {
		return c.text("Not found", 404);
	}

	try {
		const stats = statSync(file.fullPath);
		const stream = createReadStream(file.fullPath);

		return c.body(asBody(stream), 200, {
			"Content-Length": stats.size.toString(),
			"Content-Type": file.mimetype,
			"Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
		});
	} catch (error) {
		console.log(error);
		return c.text("File missing on disk", 404);
	}
});

app.get("/download-series/:seriesName", async (c) => {
	const seriesName = c.req.param("seriesName");
	const exp = Number(c.req.query("exp"));
	const sig = c.req.query("sig");

	if (!sig || !exp) {
		return c.text("Unauthorized", 401);
	}
	if (!verifySeriesSignature(seriesName, exp, sig)) {
		return c.text("Invalid or expired link", 403);
	}

	const ctx = await createContext({ context: c });
	const organizationId = ctx.session?.user
		? (ctx.session.session.activeOrganizationId ?? undefined)
		: undefined;
	if (!organizationId) {
		return c.text("Unauthorized", 401);
	}

	const entries = await getSeriesZipEntries(seriesName, organizationId);
	if (entries.length === 0) {
		return c.text("Not found", 404);
	}

	return c.body(createSeriesZipStream(entries), 200, {
		"Content-Type": "application/zip",
		"Content-Disposition": `attachment; filename="${encodeURIComponent(seriesZipFilename(seriesName))}"`,
	});
});

// Audio streaming endpoint with HTTP Range support (206 Partial Content)
import { getAudioFile } from "@nanahoshi-v2/api/routers/audiobooks/audiobook.service";

app.get("/stream/:uuid/:fileIndex", async (c) => {
	const uuid = c.req.param("uuid");
	const fileIndex = Number(c.req.param("fileIndex"));

	if (Number.isNaN(fileIndex) || fileIndex < 0) {
		return c.text("Invalid file index", 400);
	}

	// Authenticate
	const ctx = await createContext({ context: c });
	if (!ctx.session?.user) {
		return c.text("Unauthorized", 401);
	}
	const organizationId = ctx.session.session.activeOrganizationId ?? undefined;

	let file: Awaited<ReturnType<typeof getAudioFile>>;
	try {
		file = await getAudioFile(uuid, fileIndex, organizationId);
	} catch {
		return c.text("Not found", 404);
	}

	let stats: Awaited<ReturnType<typeof stat>>;
	try {
		stats = await stat(file.path);
	} catch {
		return c.text("File missing on disk", 404);
	}

	const fileSize = stats.size;
	const mimeType = file.mimeType || "audio/mpeg";
	const rangeHeader = c.req.header("Range");

	if (!rangeHeader) {
		// Full file response
		const stream = createReadStream(file.path);
		return c.body(asBody(stream), 200, {
			"Content-Length": fileSize.toString(),
			"Content-Type": mimeType,
			"Accept-Ranges": "bytes",
		});
	}

	// Parse Range header: "bytes=start-end"
	const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
	if (!match) {
		return c.text("Invalid Range", 416);
	}

	const start = Number(match[1]);
	const end = match[2] ? Number(match[2]) : fileSize - 1;

	if (start >= fileSize || end >= fileSize || start > end) {
		return c.newResponse(null, 416, {
			"Content-Range": `bytes */${fileSize}`,
		});
	}

	const chunkSize = end - start + 1;
	const stream = createReadStream(file.path, { start, end });

	return c.body(asBody(stream), 206, {
		"Content-Range": `bytes ${start}-${end}/${fileSize}`,
		"Accept-Ranges": "bytes",
		"Content-Length": chunkSize.toString(),
		"Content-Type": mimeType,
	});
});

app.get("/", (c) => {
	return c.text("OK");
});

// First steps
await runMigrations();
await firstSeed();

import { getSearchProvider } from "@nanahoshi-v2/api/infrastructure/search/search.factory";

const searchProvider = getSearchProvider();
await searchProvider.initialize().catch((err: unknown) => {
	console.warn(
		"[Search] Failed to initialize search provider on startup:",
		err,
	);
});

import { checkFfprobeAvailable } from "@nanahoshi-v2/api/modules/audioProbe";
import { checkEbookConvertAvailable } from "@nanahoshi-v2/api/modules/conversion/converter";
import {
	checkPsqlAvailable,
	syncRanobedbAutoUpdate,
} from "@nanahoshi-v2/api/modules/ranobedb/ranobedb.import";
import { getRanobedbConfig } from "@nanahoshi-v2/api/modules/settings.service";

await checkEbookConvertAvailable();
await checkFfprobeAvailable();
await checkPsqlAvailable();

// Reconcile the RanobeDB auto-update scheduler with the persisted setting
await getRanobedbConfig()
	.then((config) => syncRanobedbAutoUpdate(config.autoUpdate))
	.catch((err) =>
		console.warn("[Server] Failed to sync RanobeDB auto-update schedule", err),
	);

import "@nanahoshi-v2/api/infrastructure/workers/file.event.worker";
import "@nanahoshi-v2/api/infrastructure/workers/cover-color.worker";
import "@nanahoshi-v2/api/infrastructure/workers/metadata-enrich.worker";
import "@nanahoshi-v2/api/infrastructure/workers/ranobedb-import.worker";
import "@nanahoshi-v2/api/infrastructure/workers/send-to-kindle.worker";

// Only load search-related workers when the provider requires sync (Elasticsearch)
if (searchProvider.requiresSync()) {
	await import("@nanahoshi-v2/api/infrastructure/workers/search-sync.worker");
	await import("@nanahoshi-v2/api/infrastructure/workers/book.index.worker");
}

export default app;
