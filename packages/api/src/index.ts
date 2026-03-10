import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED");
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
		throw new ORPCError("UNAUTHORIZED");
	}
	if (context.session.user.role !== "admin") {
		throw new ORPCError("FORBIDDEN");
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
		throw new ORPCError("UNAUTHORIZED");
	}
	const organizationId = context.session.session.activeOrganizationId;
	if (!organizationId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "No active organization. Set an active organization first.",
		});
	}
	return next({
		context: {
			session: context.session,
			organizationId,
			req: context.req,
		},
	});
});

export const orgProcedure = publicProcedure.use(requireOrg);
