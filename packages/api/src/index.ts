import { ORPCError, os } from "@orpc/server";
import { db } from "@nanahoshi-v2/db";
import * as schema from "@nanahoshi-v2/db/schema/auth";
import { and, eq } from "drizzle-orm";

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

// Middleware: require system admin OR org admin/owner
const requireOrgAdmin = o.middleware(async ({ context, next }) => {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED");
	}
	// System-level admin always passes
	if (context.session.user.role === "admin") {
		return next({
			context: {
				session: context.session,
				organizationId: context.session.session.activeOrganizationId ?? "",
				req: context.req,
			},
		});
	}
	const organizationId = context.session.session.activeOrganizationId;
	if (!organizationId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "No active organization. Set an active organization first.",
		});
	}
	const userId = context.session.user.id;
	const [membership] = await db
		.select({ role: schema.member.role })
		.from(schema.member)
		.where(
			and(
				eq(schema.member.userId, userId),
				eq(schema.member.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!membership || (membership.role !== "admin" && membership.role !== "owner")) {
		throw new ORPCError("FORBIDDEN", {
			message: "Only organization admins or owners can perform this action.",
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

export const orgAdminProcedure = publicProcedure.use(requireOrgAdmin);
