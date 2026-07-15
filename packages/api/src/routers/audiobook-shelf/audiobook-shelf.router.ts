import { resolveBookScope } from "../../auth/access.repository";
import { protectedProcedure } from "../../index";
import {
	GetAudiobookShelfInput,
	GetPublicAudiobookShelfInput,
	GetPublicAudiobookShelfPaginatedInput,
	ListAudiobookShelfInput,
	RemoveAudiobookShelfInput,
	SetAudiobookShelfInput,
} from "./audiobook-shelf.model";
import * as audiobookShelfService from "./audiobook-shelf.service";

export const audiobookShelfRouter = {
	set: protectedProcedure
		.input(SetAudiobookShelfInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return audiobookShelfService.setShelfStatus(
				context.session.user.id,
				input.bookUuid,
				input.status,
				serverId,
				scope,
			);
		}),

	get: protectedProcedure
		.input(GetAudiobookShelfInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return audiobookShelfService.getShelfStatus(
				context.session.user.id,
				input.bookUuid,
				serverId,
				scope,
			);
		}),

	remove: protectedProcedure
		.input(RemoveAudiobookShelfInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return audiobookShelfService.removeShelfStatus(
				context.session.user.id,
				input.bookUuid,
				serverId,
				scope,
			);
		}),

	list: protectedProcedure
		.input(ListAudiobookShelfInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			return audiobookShelfService.listShelf(
				context.session.user.id,
				serverId,
				scope,
				input.status,
				input.limit,
			);
		}),

	getPublicShelf: protectedProcedure
		.input(GetPublicAudiobookShelfInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return audiobookShelfService.listPublicShelf(
				input.username,
				serverId,
				scope,
				input.status,
				input.limit,
			);
		}),

	getPublicShelfPaginated: protectedProcedure
		.input(GetPublicAudiobookShelfPaginatedInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return audiobookShelfService.listPublicShelfPaginated(
				input.username,
				serverId,
				scope,
				input.status,
				input.limit,
				input.offset,
			);
		}),
};
