import type { auth as authInstance } from "@nanahoshi-v2/auth";
import { db } from "@nanahoshi-v2/db";
import { member } from "@nanahoshi-v2/db/schema/auth";
import { eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";

export interface OpdsUser {
	userId: string;
	organizationId: string;
}

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

/** Resolve organizationId from an API key result (metadata → first membership fallback). */
export async function resolveOrgFromApiKey(
	auth: typeof authInstance,
	key: string,
): Promise<{ userId: string; organizationId: string } | null> {
	const result = await auth.api.verifyApiKey({ body: { key } });
	if (!result.valid || !result.key) return null;

	const userId = result.key.referenceId;
	if (!userId) return null;

	const metadata = result.key.metadata as Record<string, string> | null;
	let organizationId = metadata?.organizationId;

	if (!organizationId) {
		const [firstMembership] = await db
			.select({ organizationId: member.organizationId })
			.from(member)
			.where(eq(member.userId, userId))
			.limit(1);
		if (!firstMembership) return null;
		organizationId = firstMembership.organizationId;
	}

	return { userId, organizationId };
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

			c.set("opdsUser", user satisfies OpdsUser);
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
