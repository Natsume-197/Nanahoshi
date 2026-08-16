import { resolveBookScope } from "../../auth/access.repository";
import { protectedProcedure } from "../../index";
import { startTrackedUserSync } from "../../modules/bookmeter/bookmeter.scheduler";
import * as bookmeterService from "../../modules/bookmeter/bookmeter.service";
import {
	GetPublicProfileInput,
	LinkBookmeterInput,
	UpdatePrivacyInput,
	UpdateProfileInput,
} from "./profile.model";
import * as profileService from "./profile.service";

export const profileRouter = {
	getProfile: protectedProcedure.handler(async ({ context }) => {
		return profileService.getProfile(context.session.user.id);
	}),

	getStats: protectedProcedure.handler(async ({ context }) => {
		const { serverId, scope } = await resolveBookScope(context.session);
		return profileService.getStats(context.session.user.id, serverId, scope);
	}),

	updateProfile: protectedProcedure
		.input(UpdateProfileInput)
		.handler(async ({ input, context }) => {
			return profileService.updateProfile(context.session.user.id, {
				name: input.name,
				headerImage: input.headerImage,
			});
		}),

	getPrivacy: protectedProcedure.handler(({ context }) =>
		profileService.getPrivacy(context.session.user.id),
	),

	updatePrivacy: protectedProcedure
		.input(UpdatePrivacyInput)
		.handler(({ input, context }) =>
			profileService.updatePrivacy(context.session.user.id, input),
		),

	// Bookmeter integration (read-only import: Bookmeter → shelf)
	getBookmeterStatus: protectedProcedure.handler(({ context }) =>
		bookmeterService.getBookmeterStatus(context.session.user.id),
	),

	linkBookmeter: protectedProcedure
		.input(LinkBookmeterInput)
		.handler(async ({ input, context }) => {
			const result = await bookmeterService.linkBookmeter(
				context.session.user.id,
				input.bookmeter,
			);
			// First sync runs in the worker process right away, tracked as a task
			// so the user sees progress and gets the finish notification.
			const taskId = await startTrackedUserSync(
				context.session.user.id,
				context.session.session.activeOrganizationId ?? null,
			);
			return { ...result, taskId };
		}),

	unlinkBookmeter: protectedProcedure.handler(async ({ context }) => {
		await bookmeterService.unlinkBookmeter(context.session.user.id);
		return { success: true };
	}),

	syncBookmeterNow: protectedProcedure.handler(async ({ context }) => {
		// Throws NOT_FOUND when nothing is linked.
		await bookmeterService.getBookmeterStatusOrThrow(context.session.user.id);
		const taskId = await startTrackedUserSync(
			context.session.user.id,
			context.session.session.activeOrganizationId ?? null,
		);
		return { success: true, taskId };
	}),

	// Public profile endpoints (by username)
	getPublicProfile: protectedProcedure
		.input(GetPublicProfileInput)
		.handler(async ({ input, context }) => {
			return profileService.getProfileByUsername(
				input.username,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),
};
