import { protectedProcedure } from "../../index";
import {
	GetProgressInput,
	ListInProgressInput,
	SaveProgressInput,
} from "./reading-progress.model";
import * as readingProgressService from "./reading-progress.service";

export const readingProgressRouter = {
	saveProgress: protectedProcedure
		.input(SaveProgressInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			return readingProgressService.saveProgress(userId, input.bookUuid, {
				ttuBookId: input.ttuBookId,
				exploredCharCount: input.exploredCharCount,
				bookCharCount: input.bookCharCount,
				readingTimeSeconds: input.readingTimeSeconds,
				status: input.status,
			});
		}),

	getProgress: protectedProcedure
		.input(GetProgressInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			return readingProgressService.getProgress(userId, input.bookUuid);
		}),

	listInProgress: protectedProcedure
		.input(ListInProgressInput)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			return readingProgressService.listInProgress(userId, input?.limit ?? 20);
		}),
};
