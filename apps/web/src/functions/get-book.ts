import { createServerFn } from "@tanstack/react-start";

import { createServerClient } from "@/lib/server-orpc";
import { authMiddleware } from "@/middleware/auth";

export const getBook = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context, data }) => {
		const uuid = data as string;
		const serverClient = createServerClient(context.cookie);
		return serverClient.books.getBookWithMetadata({ uuid });
	});
