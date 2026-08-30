import { createMiddleware } from "@tanstack/react-start";

import { authClient } from "@/lib/auth-client";
import { resolveSessionLookup } from "@/lib/auth-session-error";

export const authMiddleware = createMiddleware().server(
	async ({ next, request }) => {
		const cookie = request.headers.get("cookie") ?? "";
		const result = await authClient.getSession({
			fetchOptions: {
				headers: { cookie },
			},
		});
		const session = resolveSessionLookup(result);
		return next({
			context: { session: session ?? null, cookie },
		});
	},
);
