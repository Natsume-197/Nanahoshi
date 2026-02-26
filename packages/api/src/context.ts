import { auth } from "@nanahoshi-v2/auth";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
	context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});
	return {
		session,
		req: context.req.raw,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
