import { protectedProcedure } from "../../index";
import {
	GetBookShelfInput,
	GetPublicShelfInput,
	ListBookShelfInput,
	RemoveBookShelfInput,
	SetBookShelfInput,
} from "./book-shelf.model";
import * as bookShelfService from "./book-shelf.service";

export const bookShelfRouter = {
	set: protectedProcedure
		.input(SetBookShelfInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			const orgId =
				context.session.session.activeOrganizationId ?? undefined;
			return bookShelfService.setShelfStatus(
				userId,
				input.bookUuid,
				input.status,
				orgId,
			);
		}),

	get: protectedProcedure
		.input(GetBookShelfInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			const orgId =
				context.session.session.activeOrganizationId ?? undefined;
			return bookShelfService.getShelfStatus(userId, input.bookUuid, orgId);
		}),

	remove: protectedProcedure
		.input(RemoveBookShelfInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			const orgId =
				context.session.session.activeOrganizationId ?? undefined;
			await bookShelfService.removeShelfStatus(userId, input.bookUuid, orgId);
			return { success: true };
		}),

	list: protectedProcedure
		.input(ListBookShelfInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			const orgId =
				context.session.session.activeOrganizationId ?? undefined;
			return bookShelfService.listShelf(
				userId,
				orgId,
				input?.status,
				input?.limit ?? 50,
			);
		}),

	getPublicShelf: protectedProcedure
		.input(GetPublicShelfInput)
		.handler(async ({ input, context }) => {
			const orgId =
				context.session.session.activeOrganizationId ?? undefined;
			return bookShelfService.listPublicShelf(
				input.username,
				orgId,
				input.status,
				input.limit,
			);
		}),
};
