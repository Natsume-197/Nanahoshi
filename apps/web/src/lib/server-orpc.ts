import type { AppRouter } from "@nanahoshi-v2/api/routers/index";
import { env } from "@nanahoshi-v2/env/web";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

export function createServerClient(cookie: string): RouterClient<AppRouter> {
	const link = new RPCLink({
		url: `${env.VITE_SERVER_URL}/rpc`,
		headers: { cookie },
	});

	return createORPCClient(link) as RouterClient<AppRouter>;
}
