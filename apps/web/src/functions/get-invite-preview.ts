import { createServerFn } from "@tanstack/react-start";

import { createServerClient } from "@/lib/server-orpc";
import { authMiddleware } from "@/middleware/auth";

/**
 * The invite preview carries per-user fields (`alreadyMember`, `discordLinked`),
 * so SSR must call the API with the visitor's cookie — the browser client has
 * no cookie jar on the server and would always answer as an anonymous visitor.
 */
export const getInvitePreview = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator((code: string) => code)
	.handler(async ({ context, data: code }) => {
		const serverClient = createServerClient(context.cookie);
		return serverClient.inviteLinks.preview({ code });
	});
