import { z } from "zod";
import { adminProcedure } from "../../index";
import { backfillCoverColors } from "./admin.service";
import * as adminService from "./admin.service";

export const adminRouter = {
	getSystemStats: adminProcedure.handler(async () => {
		return adminService.getSystemStats();
	}),

	listUsers: adminProcedure.handler(async () => {
		return adminService.listUsers();
	}),

	banUser: adminProcedure
		.input(z.object({ userId: z.string() }))
		.handler(async ({ input }) => {
			await adminService.banUser(input.userId);
			return { success: true };
		}),

	unbanUser: adminProcedure
		.input(z.object({ userId: z.string() }))
		.handler(async ({ input }) => {
			await adminService.unbanUser(input.userId);
			return { success: true };
		}),

	setUserRole: adminProcedure
		.input(z.object({ userId: z.string(), role: z.enum(["user", "admin"]) }))
		.handler(async ({ input }) => {
			await adminService.setUserRole(input.userId, input.role);
			return { success: true };
		}),

	listOrganizations: adminProcedure.handler(async () => {
		return adminService.listOrganizations();
	}),

	createOrganization: adminProcedure
		.input(z.object({ name: z.string().min(1), slug: z.string().min(1) }))
		.handler(async ({ input }) => {
			return adminService.createOrganization(input.name, input.slug);
		}),

	deleteOrganization: adminProcedure
		.input(z.object({ orgId: z.string() }))
		.handler(async ({ input }) => {
			await adminService.deleteOrganization(input.orgId);
			return { success: true };
		}),

	getOrgWithMembers: adminProcedure
		.input(z.object({ orgId: z.string() }))
		.handler(async ({ input }) => {
			return adminService.getOrgWithMembers(input.orgId);
		}),

	removeMember: adminProcedure
		.input(z.object({ memberId: z.string() }))
		.handler(async ({ input }) => {
			await adminService.removeMember(input.memberId);
			return { success: true };
		}),

	updateMemberRole: adminProcedure
		.input(z.object({ memberId: z.string(), role: z.string() }))
		.handler(async ({ input }) => {
			await adminService.updateMemberRole(input.memberId, input.role);
			return { success: true };
		}),

	backfillCoverColors: adminProcedure.handler(async () => {
		const enqueued = await backfillCoverColors();
		return { enqueued };
	}),
};
