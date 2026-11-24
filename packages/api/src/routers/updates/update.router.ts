import { adminProcedure, protectedProcedure } from "../../index";
import { InstallUpdateInput, UpdatePreferencesInput } from "./update.model";
import * as updateService from "./update.service";

export const updatesRouter = {
	/** The running release and any planned restart, for every signed-in person. */
	notice: protectedProcedure.handler(({ context }) =>
		updateService.getUpdateNotice(context.session.user.role === "admin"),
	),

	status: adminProcedure.handler(() => updateService.getUpdateStatus()),

	check: adminProcedure.handler(async () => {
		await updateService.checkForUpdates();
		return updateService.getUpdateStatus();
	}),

	download: adminProcedure.handler(() => updateService.downloadUpdate()),

	install: adminProcedure
		.input(InstallUpdateInput)
		.handler(({ input, context }) =>
			updateService.scheduleInstall(input.when, {
				id: context.session.user.id,
				name: context.session.user.name,
			}),
		),

	cancel: adminProcedure.handler(() => updateService.cancelInstall()),

	setPreferences: adminProcedure
		.input(UpdatePreferencesInput)
		.handler(({ input }) => updateService.setUpdatePreferences(input)),
};
