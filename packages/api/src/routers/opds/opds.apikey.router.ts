import { auth } from "@nanahoshi-v2/auth";
import { hasGlobal } from "../../auth/access.service";
import { ForbiddenError, NotFoundError } from "../../errors";
import { orgReadProcedure, requirePermission } from "../../index";
import { CreateOpdsKeyInput, DeleteOpdsKeyInput } from "./opds.model";

function belongsToServer(
	key: { metadata?: unknown },
	serverId: string,
): boolean {
	const metadata = key.metadata;
	return (
		typeof metadata === "object" &&
		metadata !== null &&
		"serverId" in metadata &&
		metadata.serverId === serverId
	);
}

export const opdsKeysRouter = {
	create: requirePermission("apiKey", "create")
		.input(CreateOpdsKeyInput)
		.handler(async ({ input, context }) => {
			const result = await auth.api.createApiKey({
				body: {
					name: input.name,
					metadata: { serverId: context.serverId },
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

	list: orgReadProcedure.handler(async ({ context }) => {
		if (
			!hasGlobal(context.pc, "apiKey", "create") &&
			!hasGlobal(context.pc, "apiKey", "revoke")
		) {
			throw new ForbiddenError(
				"Missing permission: apiKey:create or apiKey:revoke",
			);
		}
		const result = await auth.api.listApiKeys({
			headers: context.req.headers,
		});
		return (result.apiKeys ?? [])
			.filter((k) => belongsToServer(k, context.serverId))
			.map((k) => ({
				id: k.id,
				name: k.name,
				start: k.start,
				enabled: k.enabled,
				createdAt: k.createdAt,
				lastRequest: k.lastRequest,
			}));
	}),

	delete: requirePermission("apiKey", "revoke")
		.input(DeleteOpdsKeyInput)
		.handler(async ({ input, context }) => {
			const result = await auth.api.listApiKeys({
				headers: context.req.headers,
			});
			const key = (result.apiKeys ?? []).find((k) => k.id === input.keyId);
			if (!key || !belongsToServer(key, context.serverId)) {
				throw new NotFoundError("API key not found");
			}
			await auth.api.deleteApiKey({
				body: { keyId: input.keyId },
				headers: context.req.headers,
			});
			return { success: true };
		}),
};
