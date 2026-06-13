import { createServerFn } from "@tanstack/react-start";

import { createServerClient } from "@/lib/server-orpc";
import { authMiddleware } from "@/middleware/auth";

export const getAudiobook = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator((uuid: string) => uuid)
	.handler(async ({ context, data: uuid }) => {
		const serverClient = createServerClient(context.cookie);
		return serverClient.audiobooks.getDetails({ uuid });
	});
