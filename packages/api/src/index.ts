import { os } from "@orpc/server";
import {
	getAccessibleLibraryIds,
	getUserPermissionContext,
} from "./auth/access.repository";
import { hasGlobal } from "./auth/access.service";
import type { Resource } from "./auth/permissions.catalog";
import type { Context } from "./context";
import { BadRequestError, ForbiddenError, UnauthorizedError } from "./errors";

const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
	if (!context.session?.user) {
		throw new UnauthorizedError("Authentication required.");
	}
	return next({
		context: {
			session: context.session,
		},
	});
});

export const protectedProcedure = publicProcedure.use(requireAuth);

const requireAdmin = o.middleware(async ({ context, next }) => {
	if (!context.session?.user) {
		throw new UnauthorizedError("Authentication required.");
	}
	if (context.session.user.role !== "admin") {
		throw new ForbiddenError("Admin access required.");
	}
	return next({
		context: {
			session: context.session,
		},
	});
});

export const adminProcedure = publicProcedure.use(requireAdmin);

const requireOrg = o.middleware(async ({ context, next }) => {
	if (!context.session?.user) {
		throw new UnauthorizedError("Authentication required.");
	}
	const serverId = context.session.session.activeOrganizationId;
	if (!serverId) {
		throw new BadRequestError(
			"No active organization. Set an active organization first.",
		);
	}
	return next({
		context: {
			session: context.session,
			serverId,
			req: context.req,
		},
	});
});

export const orgProcedure = publicProcedure.use(requireOrg);

/**
 * Gate on a global `resource:action`. Exposes the resolved `context.pc` for
 * per-library `can()` checks. For library-scoped actions, also check `can(...)`.
 */
export function requirePermission(resource: Resource, action: string) {
	return orgProcedure.use(async ({ context, next }) => {
		const pc = await getUserPermissionContext(
			context.session.user.id,
			context.serverId,
			{ isAppOwner: context.session.user.role === "admin" },
		);
		if (!hasGlobal(pc, resource, action)) {
			throw new ForbiddenError(`Missing permission: ${resource}:${action}`);
		}
		return next({ context: { pc } });
	});
}

/** Read procedure exposing `context.accessibleLibraryIds` ("ALL" = no filter) + `context.pc`. */
export const orgReadProcedure = orgProcedure.use(async ({ context, next }) => {
	const pc = await getUserPermissionContext(
		context.session.user.id,
		context.serverId,
		{ isAppOwner: context.session.user.role === "admin" },
	);
	const accessibleLibraryIds = await getAccessibleLibraryIds(
		context.session.user.id,
		context.serverId,
		pc,
	);
	return next({ context: { pc, accessibleLibraryIds } });
});
