import { resolveBookScope } from "../../auth/access.repository";
import { protectedProcedure } from "../../index";
import {
	CorrectReadingSessionInput,
	ReadingHistoryInput,
	ReadingPreferencesInput,
	ReadingRunInput,
	ReadingSessionIdInput,
	SyncReadingSessionInput,
} from "./reading-sessions.model";
import { readingSessionsRepository } from "./reading-sessions.repository";
import * as service from "./reading-sessions.service";
export const readingSessionsRouter = {
	preferences: protectedProcedure.handler(({ context }) =>
		readingSessionsRepository.preferences(context.session.user.id),
	),
	setPreferences: protectedProcedure
		.input(ReadingPreferencesInput)
		.handler(({ input, context }) =>
			readingSessionsRepository.setPreferences(context.session.user.id, input),
		),
	sync: protectedProcedure
		.input(SyncReadingSessionInput)
		.handler(async ({ input, context }) =>
			service.sync(
				{
					userId: context.session.user.id,
					...(await resolveBookScope(context.session)),
				},
				input,
			),
		),
	history: protectedProcedure
		.input(ReadingHistoryInput)
		.handler(async ({ input, context }) =>
			service.history(
				{
					userId: context.session.user.id,
					...(await resolveBookScope(context.session)),
				},
				input,
			),
		),
	mutateRun: protectedProcedure
		.input(ReadingRunInput)
		.handler(async ({ input, context }) =>
			service.mutateRun(
				{
					userId: context.session.user.id,
					...(await resolveBookScope(context.session)),
				},
				input,
			),
		),
	discard: protectedProcedure
		.input(ReadingSessionIdInput)
		.handler(async ({ input, context }) =>
			service.discard(
				{
					userId: context.session.user.id,
					...(await resolveBookScope(context.session)),
				},
				input,
			),
		),
	correct: protectedProcedure
		.input(CorrectReadingSessionInput)
		.handler(async ({ input, context }) =>
			service.correct(
				{
					userId: context.session.user.id,
					...(await resolveBookScope(context.session)),
				},
				input,
			),
		),
};
