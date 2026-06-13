import { orgProcedure } from "../../index";
import {
	GetLikeStatusInput,
	ListLikedInput,
	ToggleLikeInput,
} from "./liked-books.model";
import * as likedBooksService from "./liked-books.service";

export const likedBooksRouter = {
	toggleLike: orgProcedure
		.input(ToggleLikeInput)
		.handler(async ({ input, context }) => {
			return likedBooksService.toggleLike(
				context.session.user.id,
				input.bookUuid,
				context.organizationId,
			);
		}),

	getLikeStatus: orgProcedure
		.input(GetLikeStatusInput)
		.handler(async ({ input, context }) => {
			return likedBooksService.getLikeStatus(
				context.session.user.id,
				input.bookUuid,
				context.organizationId,
			);
		}),

	listLiked: orgProcedure
		.input(ListLikedInput)
		.handler(async ({ input, context }) => {
			return likedBooksService.listLiked(
				context.session.user.id,
				context.organizationId,
				{
					limit: input?.limit ?? 20,
					offset: input?.cursor ?? 0,
					sort: input?.sort ?? "recent",
					query: input?.query,
				},
			);
		}),

	count: orgProcedure.handler(async ({ context }) => {
		return likedBooksService.countLiked(
			context.session.user.id,
			context.organizationId,
		);
	}),
};
