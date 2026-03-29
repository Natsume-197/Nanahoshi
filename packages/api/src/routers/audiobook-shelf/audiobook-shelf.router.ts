import { protectedProcedure } from "../../index";
import {
	GetAudiobookShelfInput,
	ListAudiobookShelfInput,
	RemoveAudiobookShelfInput,
	SetAudiobookShelfInput,
} from "./audiobook-shelf.model";
import * as audiobookShelfService from "./audiobook-shelf.service";

export const audiobookShelfRouter = {
	set: protectedProcedure
		.input(SetAudiobookShelfInput)
		.handler(async ({ input, context }) => {
			return audiobookShelfService.setShelfStatus(
				context.session.user.id,
				input.bookUuid,
				input.status,
			);
		}),

	get: protectedProcedure
		.input(GetAudiobookShelfInput)
		.handler(async ({ input, context }) => {
			return audiobookShelfService.getShelfStatus(
				context.session.user.id,
				input.bookUuid,
			);
		}),

	remove: protectedProcedure
		.input(RemoveAudiobookShelfInput)
		.handler(async ({ input, context }) => {
			return audiobookShelfService.removeShelfStatus(
				context.session.user.id,
				input.bookUuid,
			);
		}),

	list: protectedProcedure
		.input(ListAudiobookShelfInput)
		.handler(async ({ input, context }) => {
			const organizationId =
				context.session.session.activeOrganizationId ?? undefined;
			if (!organizationId) return [];
			return audiobookShelfService.listShelf(
				context.session.user.id,
				organizationId,
				input.status,
				input.limit,
			);
		}),
};
