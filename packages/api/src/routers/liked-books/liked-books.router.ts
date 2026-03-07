import { protectedProcedure } from "../../index";
import {
	GetLikeStatusInput,
	ListLikedInput,
	ToggleLikeInput,
} from "./liked-books.model";
import * as likedBooksService from "./liked-books.service";

export const likedBooksRouter = {
	toggleLike: protectedProcedure
		.input(ToggleLikeInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			return likedBooksService.toggleLike(
				userId,
				input.bookUuid,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	getLikeStatus: protectedProcedure
		.input(GetLikeStatusInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			return likedBooksService.getLikeStatus(
				userId,
				input.bookUuid,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	listLiked: protectedProcedure
		.input(ListLikedInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			return likedBooksService.listLiked(
				userId,
				input?.limit ?? 20,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),
};
