import { orgReadProcedure } from "../../index";
import {
	ContinueSeriesInput,
	ForUserInput,
	NotInterestedInput,
	PopularInput,
	SimilarToBookInput,
	SimilarToSeriesInput,
} from "./recommendations.model";
import * as recommendationsService from "./recommendations.service";

export const recommendationsRouter = {
	forUser: orgReadProcedure
		.input(ForUserInput)
		.handler(async ({ input, context }) => {
			return recommendationsService.forUser(
				context.session.user.id,
				context.serverId,
				context.accessibleLibraryIds,
				{
					format: input?.format ?? "all",
					perMixLimit: input?.perMixLimit ?? 15,
				},
			);
		}),

	continueSeries: orgReadProcedure
		.input(ContinueSeriesInput)
		.handler(async ({ input, context }) => {
			return recommendationsService.continueSeries(
				context.session.user.id,
				context.serverId,
				context.accessibleLibraryIds,
				{
					format: input?.format ?? "all",
					limit: input?.limit ?? 15,
				},
			);
		}),

	popular: orgReadProcedure
		.input(PopularInput)
		.handler(async ({ input, context }) => {
			return recommendationsService.popular(
				context.session.user.id,
				context.serverId,
				context.accessibleLibraryIds,
				{
					format: input?.format ?? "all",
					limit: input?.limit ?? 15,
				},
			);
		}),

	similarToBook: orgReadProcedure
		.input(SimilarToBookInput)
		.handler(async ({ input, context }) => {
			return recommendationsService.similarToBook(
				context.session.user.id,
				context.serverId,
				context.accessibleLibraryIds,
				{
					bookUuid: input.bookUuid,
					format: input.format ?? "all",
					limit: input.limit ?? 12,
				},
			);
		}),

	similarToSeries: orgReadProcedure
		.input(SimilarToSeriesInput)
		.handler(async ({ input, context }) => {
			return recommendationsService.similarToSeries(
				context.session.user.id,
				context.serverId,
				context.accessibleLibraryIds,
				{
					seriesUuid: input.seriesUuid,
					format: input.format ?? "all",
					limit: input.limit ?? 12,
				},
			);
		}),

	notInterested: orgReadProcedure
		.input(NotInterestedInput)
		.handler(async ({ input, context }) => {
			return recommendationsService.setNotInterested(
				context.session.user.id,
				context.serverId,
				input,
				false,
			);
		}),

	undoNotInterested: orgReadProcedure
		.input(NotInterestedInput)
		.handler(async ({ input, context }) => {
			return recommendationsService.setNotInterested(
				context.session.user.id,
				context.serverId,
				input,
				true,
			);
		}),
};
