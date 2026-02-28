import { createMiddleware } from "@tanstack/react-start";

import { authClient } from "@/lib/auth-client";

export const authMiddleware = createMiddleware().server(
	async ({ next, request }) => {
		const cookie = request.headers.get("cookie") ?? "";
		const { data: session } = await authClient.getSession({
			fetchOptions: {
				headers: { cookie },
			},
		});
		return next({
			context: { session: session ?? null },
		});
	},
);
