import { createServerFn } from "@tanstack/react-start";

import { createServerClient } from "@/lib/server-orpc";
import { authMiddleware } from "@/middleware/auth";

export const getBook = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator((uuid: string) => uuid)
	.handler(async ({ context, data: uuid }) => {
		const serverClient = createServerClient(context.cookie);
		// Resolves the book's org when it's outside the active org. Returns
		// `{ book, switchedOrgId }`; switchedOrgId is non-null when the active
		// org needs to change client-side to match the book.
		return serverClient.books.getBookResolvingOrg({ uuid });
	});
