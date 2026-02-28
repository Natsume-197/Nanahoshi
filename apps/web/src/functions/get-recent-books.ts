import { createServerFn } from "@tanstack/react-start";

import { createServerClient } from "@/lib/server-orpc";
import { authMiddleware } from "@/middleware/auth";

export const getRecentBooks = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const serverClient = createServerClient(context.cookie);
		return serverClient.books.listRecent({ limit: 6 });
	});

export const getRecentlyReadBooks = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const serverClient = createServerClient(context.cookie);
		return serverClient.readingProgress.listInProgress({ limit: 6 });
	});
