import type { auth as authInstance } from "@nanahoshi-v2/auth";
import type { Context, MiddlewareHandler } from "hono";
import {
	getAccessibleLibraryIds,
	getUserPermissionContext,
} from "../../auth/access.repository";
import { hasGlobal } from "../../auth/access.service";
import type { OpdsUser } from "./opds.model";
import { opdsRepository } from "./opds.repository";

/** Extract the API key from a Basic Auth header. Returns null if parsing fails. */
export function parseBasicAuthKey(header: string | undefined): string | null {
	if (!header?.startsWith("Basic ")) return null;
	try {
		const decoded = atob(header.slice(6));
		const colonIdx = decoded.indexOf(":");
		if (colonIdx === -1) return null;
		const key = decoded.slice(colonIdx + 1);
		return key || null;
	} catch {
		return null;
	}
}

/** Resolve serverId from an API key result (metadata → first membership fallback). */
export async function resolveOrgFromApiKey(
	auth: typeof authInstance,
	key: string,
): Promise<{ userId: string; serverId: string } | null> {
	const result = await auth.api.verifyApiKey({ body: { key } });
	if (!result.valid || !result.key) return null;

	const userId = result.key.referenceId;
	if (!userId) return null;

	const metadata = result.key.metadata as Record<string, string> | null;
	let serverId = metadata?.serverId;

	if (!serverId) {
		const firstOrg = await opdsRepository.getFirstMembershipOrg(userId);
		if (!firstOrg) return null;
		serverId = firstOrg;
	}

	return { userId, serverId };
}

export function opdsAuthMiddleware(
	auth: typeof authInstance,
): MiddlewareHandler {
	return async (c: Context, next) => {
		const key = parseBasicAuthKey(c.req.header("Authorization"));
		if (!key) return unauthorizedResponse(c);

		try {
			const user = await resolveOrgFromApiKey(auth, key);
			if (!user) return unauthorizedResponse(c);

			// Enforce opds:access and resolve the user's visible libraries.
			const pc = await getUserPermissionContext(user.userId, user.serverId, {
				isAppOwner: false,
			});
			if (!hasGlobal(pc, "opds", "access")) {
				return c.text("Forbidden", 403);
			}
			const accessibleLibraryIds = await getAccessibleLibraryIds(
				user.userId,
				user.serverId,
				pc,
			);

			c.set("opdsUser", {
				...user,
				accessibleLibraryIds,
			} satisfies OpdsUser);
			await next();
		} catch {
			return unauthorizedResponse(c);
		}
	};
}

function unauthorizedResponse(c: Context) {
	return c.text("Unauthorized", 401, {
		"WWW-Authenticate": 'Basic realm="Nanahoshi OPDS"',
	});
}
