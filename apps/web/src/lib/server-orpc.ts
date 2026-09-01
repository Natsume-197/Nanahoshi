import type { AppRouter } from "@nanahoshi-v2/api/routers/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

import { getApiOrigin } from "./api-origin";

export function createServerClient(cookie: string): RouterClient<AppRouter> {
	const link = new RPCLink({
		url: `${getApiOrigin()}/rpc`,
		headers: { cookie },
	});

	return createORPCClient(link) as RouterClient<AppRouter>;
}
