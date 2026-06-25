import { adminProcedure } from "../../index";
import {
	BanUserInput,
	CreateOrganizationInput,
	DeleteOrganizationInput,
	GetOrgWithMembersInput,
	RemoveMemberInput,
	SetUserRoleInput,
	UnbanUserInput,
	UpdateMemberRoleInput,
} from "./admin.model";
import * as adminService from "./admin.service";
import { backfillCoverColors } from "./admin.service";

export const adminRouter = {
	getSystemStats: adminProcedure.handler(async () => {
		return adminService.getSystemStats();
	}),

	listUsers: adminProcedure.handler(async () => {
		return adminService.listUsers();
	}),

	banUser: adminProcedure.input(BanUserInput).handler(async ({ input }) => {
		await adminService.banUser(input.userId);
		return { success: true };
	}),

	unbanUser: adminProcedure.input(UnbanUserInput).handler(async ({ input }) => {
		await adminService.unbanUser(input.userId);
		return { success: true };
	}),

	setUserRole: adminProcedure
		.input(SetUserRoleInput)
		.handler(async ({ input }) => {
			await adminService.setUserRole(input.userId, input.role);
			return { success: true };
		}),

	listServers: adminProcedure.handler(async () => {
		return adminService.listServers();
	}),

	createServer: adminProcedure
		.input(CreateOrganizationInput)
		.handler(async ({ input, context }) => {
			return adminService.createServer(
				input.name,
				input.slug,
				context.session.user.id,
			);
		}),

	deleteServer: adminProcedure
		.input(DeleteOrganizationInput)
		.handler(async ({ input }) => {
			await adminService.deleteServer(input.orgId);
			return { success: true };
		}),

	getOrgWithMembers: adminProcedure
		.input(GetOrgWithMembersInput)
		.handler(async ({ input }) => {
			return adminService.getOrgWithMembers(input.orgId);
		}),

	removeMember: adminProcedure
		.input(RemoveMemberInput)
		.handler(async ({ input }) => {
			await adminService.removeMember(input.memberId);
			return { success: true };
		}),

	updateMemberRole: adminProcedure
		.input(UpdateMemberRoleInput)
		.handler(async ({ input }) => {
			await adminService.updateMemberRole(input.memberId, input.role);
			return { success: true };
		}),

	backfillCoverColors: adminProcedure.handler(async () => {
		const enqueued = await backfillCoverColors();
		return { enqueued };
	}),

	triggerBookReindex: adminProcedure.handler(async () => {
		await adminService.triggerBookReindex();
		return { success: true };
	}),

	triggerMetadataEnrich: adminProcedure.handler(async () => {
		const started = await adminService.triggerMetadataEnrich();
		return { success: true, started };
	}),

	retryFailedEnrichment: adminProcedure.handler(async () => {
		const count = await adminService.retryFailedEnrichment();
		return { success: true, count };
	}),
};
