import { orgReadProcedure } from "../../index";
import {
	CountLikedInput,
	GetLikeStatusInput,
	ListLikedInput,
	ToggleLikeInput,
} from "./liked-books.model";
import * as likedBooksService from "./liked-books.service";

export const likedBooksRouter = {
	toggleLike: orgReadProcedure
		.input(ToggleLikeInput)
		.handler(async ({ input, context }) => {
			return likedBooksService.toggleLike(
				context.session.user.id,
				input.bookUuid,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),

	getLikeStatus: orgReadProcedure
		.input(GetLikeStatusInput)
		.handler(async ({ input, context }) => {
			return likedBooksService.getLikeStatus(
				context.session.user.id,
				input.bookUuid,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),

	listLiked: orgReadProcedure
		.input(ListLikedInput)
		.handler(async ({ input, context }) => {
			return likedBooksService.listLiked(
				context.session.user.id,
				context.serverId,
				context.accessibleLibraryIds,
				{
					limit: input?.limit ?? 20,
					offset: input?.cursor ?? 0,
					sort: input?.sort ?? "recent",
					query: input?.query,
					format: input?.format ?? "books",
				},
			);
		}),

	count: orgReadProcedure
		.input(CountLikedInput)
		.handler(async ({ input, context }) => {
			return likedBooksService.countLiked(
				context.session.user.id,
				context.serverId,
				context.accessibleLibraryIds,
				input?.format ?? "books",
			);
		}),
};
