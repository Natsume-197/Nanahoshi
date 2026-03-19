import { auth } from "@nanahoshi-v2/auth";
import { z } from "zod";
import { orgProcedure } from "../../index";

export const opdsKeysRouter = {
	create: orgProcedure
		.input(
			z.object({
				name: z.string().min(1).max(32),
			}),
		)
		.handler(async ({ input, context }) => {
			const result = await auth.api.createApiKey({
				body: {
					name: input.name,
					metadata: { organizationId: context.organizationId },
				},
				headers: context.req.headers,
			});
			return {
				id: result.id,
				name: result.name,
				key: result.key,
				createdAt: result.createdAt,
			};
		}),

	list: orgProcedure.handler(async ({ context }) => {
		const result = await auth.api.listApiKeys({
			headers: context.req.headers,
		});
		return (result.apiKeys ?? []).map((k) => ({
			id: k.id,
			name: k.name,
			start: k.start,
			enabled: k.enabled,
			createdAt: k.createdAt,
			lastRequest: k.lastRequest,
		}));
	}),

	delete: orgProcedure
		.input(z.object({ keyId: z.string() }))
		.handler(async ({ input, context }) => {
			await auth.api.deleteApiKey({
				body: { keyId: input.keyId },
				headers: context.req.headers,
			});
			return { success: true };
		}),
};
