import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { bookIndexQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/book-index.queue";
import { coverColorQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/cover-color.queue";
import { fileEventQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/file-event.queue";
import { metadataEnrichQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/metadata-enrich.queue";
import { ranobedbImportQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/ranobedb-import.queue";
import { scheduledScanQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/scheduled-scan.queue";
import { searchSyncQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/search-sync.queue";
import { sendToKindleQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/send-to-kindle.queue";
import { auth } from "@nanahoshi-v2/auth";
import type { Hono } from "hono";
import { serveStatic } from "hono/bun";

export function mountBullBoard(app: Hono) {
	const serverAdapter = new HonoAdapter(serveStatic);
	createBullBoard({
		queues: [
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
			new BullMQAdapter(scheduledScanQueue, {
				description:
					"Library scans and reprocesses (scheduled and manual) — the producers that feed file-events",
			}),
		],
		serverAdapter,
	});

	const basePath = "/admin/queues/";
	serverAdapter.setBasePath(basePath);
	app.use("/admin/*", async (c, next) => {
		const session = await auth.api.getSession({ headers: c.req.raw.headers });
		if (session?.user?.role !== "admin") {
			return c.text("Unauthorized", 401);
		}
		await next();
	});
	app.route(basePath, serverAdapter.registerPlugin());
}
