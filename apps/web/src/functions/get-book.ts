import { createServerFn } from "@tanstack/react-start";

import { createServerClient } from "@/lib/server-orpc";
import { authMiddleware } from "@/middleware/auth";

export const getBook = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator((uuid: string) => uuid)
	.handler(async ({ context, data: uuid }) => {
		const serverClient = createServerClient(context.cookie);
		return serverClient.books.getBookWithMetadata({ uuid });
	});
