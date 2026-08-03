import { protectedProcedure } from "../../index";
import {
	DeleteNotificationInput,
	ListNotificationsInput,
	MarkReadInput,
} from "./notification.model";
import { notificationRepository } from "./notification.repository";
import * as notificationService from "./notification.service";

// protectedProcedure (not orgProcedure): notifications are per-user across
// servers. Mutations go through the service so every tab of
// the user gets the change pushed over the gateway.
export const notificationsRouter = {
	list: protectedProcedure
		.input(ListNotificationsInput)
		.handler(async ({ input, context }) => {
			return notificationRepository.list(
				context.session.user.id,
				input.limit,
				input.cursor,
			);
		}),

	unreadCount: protectedProcedure.handler(async ({ context }) => {
		const count = await notificationRepository.unreadCount(
			context.session.user.id,
		);
		return { count };
	}),

	markAllRead: protectedProcedure.handler(async ({ context }) => {
		await notificationService.markAllRead(context.session.user.id);
		return { success: true };
	}),

	markRead: protectedProcedure
		.input(MarkReadInput)
		.handler(async ({ input, context }) => {
			await notificationService.markRead(context.session.user.id, input.ids);
			return { success: true };
		}),

	delete: protectedProcedure
		.input(DeleteNotificationInput)
		.handler(async ({ input, context }) => {
			await notificationService.deleteNotification(
				context.session.user.id,
				input.id,
			);
			return { success: true };
		}),
};
