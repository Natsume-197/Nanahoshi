import { resolveBookScope } from "../../auth/access.repository";
import { protectedProcedure } from "../../index";
import {
	GetBookShelfInput,
	GetPublicShelfInput,
	GetPublicShelfPaginatedInput,
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
			const { serverId, scope } = await resolveBookScope(context.session);
			return bookShelfService.setShelfStatus(
				userId,
				input.bookUuid,
				input.status,
				serverId,
				scope,
			);
		}),

	get: protectedProcedure
		.input(GetBookShelfInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			const { serverId, scope } = await resolveBookScope(context.session);
			return bookShelfService.getShelfStatus(
				userId,
				input.bookUuid,
				serverId,
				scope,
			);
		}),

	remove: protectedProcedure
		.input(RemoveBookShelfInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			const { serverId, scope } = await resolveBookScope(context.session);
			await bookShelfService.removeShelfStatus(
				userId,
				input.bookUuid,
				serverId,
				scope,
			);
			return { success: true };
		}),

	list: protectedProcedure
		.input(ListBookShelfInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			const { serverId, scope } = await resolveBookScope(context.session);
			return bookShelfService.listShelf(
				userId,
				serverId,
				scope,
				input?.status,
				input?.limit ?? 50,
			);
		}),

	getPublicShelf: protectedProcedure
		.input(GetPublicShelfInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return bookShelfService.listPublicShelf(
				input.username,
				serverId,
				scope,
				input.status,
				input.limit,
			);
		}),

	getPublicShelfPaginated: protectedProcedure
		.input(GetPublicShelfPaginatedInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return bookShelfService.listPublicShelfPaginated(
				input.username,
				serverId,
				scope,
				input.status,
				input.limit,
				input.offset,
			);
		}),
};
