import { pinoRequestLogger } from "@nanahoshi-v2/api/lib/request-logger";
import { createOpdsApp } from "@nanahoshi-v2/api/routers/opds/opds.routes";
import { auth } from "@nanahoshi-v2/auth";
import { env } from "@nanahoshi-v2/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { mountBullBoard } from "./admin/bull-board";
import { mountGateway } from "./gateway/gateway";
import { compressResponses } from "./lib/compress";
import { mountCovers } from "./routes/covers";
import { mountDownloads } from "./routes/downloads";
import { mountMediaStatic, mountMediaUploads } from "./routes/media";
import { mountOrpc } from "./routes/orpc";
import { mountStream } from "./routes/stream";
import { mountUploads } from "./routes/uploads";

// Mount order is significant: Hono matches in registration order, so Bull Board,
// static media and OPDS must precede CORS, and the oRPC catch-all must precede
// the file routes it falls through to.
export function buildApp(): Hono {
	const app = new Hono();

	// Baseline security headers on every response. Intentionally omits
	// Cross-Origin-Resource/Embedder/Opener-Policy: the web app is a separate
	// origin that loads covers/media/audio cross-origin, which those would break.
	app.use("/*", async (c, next) => {
		await next();
		c.res.headers.set("X-Content-Type-Options", "nosniff");
		c.res.headers.set("X-Frame-Options", "DENY");
		c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
	});

	app.use(compressResponses());

	mountBullBoard(app);
	mountMediaStatic(app);
	app.route("/opds", createOpdsApp(auth));

	app.use(pinoRequestLogger());
	app.use(
		"/*",
		cors({
			origin: env.CORS_ORIGIN,
			allowMethods: ["GET", "POST", "OPTIONS"],
			allowHeaders: ["Content-Type", "Authorization", "x-invite-code"],
			exposeHeaders: ["Content-Length"],
			credentials: true,
		}),
	);

	app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

	mountMediaUploads(app);
	mountUploads(app);
	mountGateway(app);
	mountOrpc(app);

	mountCovers(app);
	mountDownloads(app);
	mountStream(app);

	app.get("/", (c) => c.text("OK"));

	return app;
}
