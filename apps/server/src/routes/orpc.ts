import { createContext } from "@nanahoshi-v2/api/context";
import { errorHandlerInterceptor } from "@nanahoshi-v2/api/lib/error-handler";
import { appRouter } from "@nanahoshi-v2/api/routers/index";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import type { Hono } from "hono";

export const apiHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		}),
	],
	interceptors: [errorHandlerInterceptor],
});

export const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [errorHandlerInterceptor],
});

export function mountOrpc(app: Hono) {
	app.use("/*", async (c, next) => {
		const context = await createContext({ context: c });

		const rpcResult = await rpcHandler.handle(c.req.raw, {
			prefix: "/rpc",
			context,
		});
		if (rpcResult.matched) {
			return c.newResponse(rpcResult.response.body, rpcResult.response);
		}

		const apiResult = await apiHandler.handle(c.req.raw, {
			prefix: "/api-reference",
			context,
		});
		if (apiResult.matched) {
			return c.newResponse(apiResult.response.body, apiResult.response);
		}

		await next();
	});
}
