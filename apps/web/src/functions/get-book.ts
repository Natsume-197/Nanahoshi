import type { AppRouter } from "@nanahoshi-v2/api/routers/index";
import { env } from "@nanahoshi-v2/env/web";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createMiddleware, createServerFn } from "@tanstack/react-start";

import { authMiddleware } from "@/middleware/auth";

const forwardHeaders = createMiddleware().server(async ({ next, request }) => {
	return next({
		context: { cookie: request.headers.get("cookie") ?? "" },
	});
});

export const getBook = createServerFn({ method: "GET" })
	.middleware([authMiddleware, forwardHeaders])
	.handler(async ({ context, data: uuid }: { context: any; data: string }) => {
		const link = new RPCLink({
			url: `${env.VITE_SERVER_URL}/rpc`,
			headers: { cookie: context.cookie },
		});

		const serverClient = createORPCClient(link) as RouterClient<AppRouter>;
		return serverClient.books.getBookWithMetadata({ uuid });
	});
