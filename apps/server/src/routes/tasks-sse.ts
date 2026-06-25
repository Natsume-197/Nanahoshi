import { subscribeToTaskUpdates } from "@nanahoshi-v2/api/modules/taskManager";
import { auth } from "@nanahoshi-v2/auth";
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";

export function mountTasksSse(app: Hono) {
	app.get("/api/tasks/events", async (c) => {
		const session = await auth.api.getSession({ headers: c.req.raw.headers });
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
}
