import {
	adminProcedure,
	protectedProcedure,
	requirePermission,
} from "../../index";
import {
	AnnouncementIdInput,
	CreateAnnouncementInput,
	UpdateAnnouncementInput,
} from "./announcement.model";
import { announcementRepository } from "./announcement.repository";
import * as announcementService from "./announcement.service";

const serverManage = () => requirePermission("settings", "update");

export const announcementsRouter = {
	/** Banners to show the caller now: the instance's plus their active server's. */
	active: protectedProcedure.handler(async ({ context }) => {
		return announcementService.listActive({
			userId: context.session.user.id,
			activeServerId: context.session.session.activeOrganizationId,
			isAppOwner: context.session.user.role === "admin",
		});
	}),

	dismiss: protectedProcedure
		.input(AnnouncementIdInput)
		.handler(async ({ input, context }) => {
			await announcementService.dismiss({
				id: input.id,
				userId: context.session.user.id,
				activeServerId: context.session.session.activeOrganizationId,
				isAppOwner: context.session.user.role === "admin",
			});
			return { success: true };
		}),

	instance: {
		list: adminProcedure.handler(() =>
			announcementRepository.listByScope(null),
		),
		create: adminProcedure
			.input(CreateAnnouncementInput)
			.handler(({ input, context }) =>
				announcementRepository.create(null, context.session.user.id, input),
			),
		update: adminProcedure
			.input(UpdateAnnouncementInput)
			.handler(({ input }) =>
				announcementService.update(null, input.id, input.fields),
			),
		delete: adminProcedure
			.input(AnnouncementIdInput)
			.handler(async ({ input }) => {
				await announcementService.remove(null, input.id);
				return { success: true };
			}),
	},

	server: {
		list: serverManage().handler(({ context }) =>
			announcementRepository.listByScope(context.serverId),
		),
		create: serverManage()
			.input(CreateAnnouncementInput)
			.handler(({ input, context }) =>
				announcementRepository.create(
					context.serverId,
					context.session.user.id,
					input,
				),
			),
		update: serverManage()
			.input(UpdateAnnouncementInput)
			.handler(({ input, context }) =>
				announcementService.update(context.serverId, input.id, input.fields),
			),
		delete: serverManage()
			.input(AnnouncementIdInput)
			.handler(async ({ input, context }) => {
				await announcementService.remove(context.serverId, input.id);
				return { success: true };
			}),
	},
};
