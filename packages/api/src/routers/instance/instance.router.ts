import { adminProcedure } from "../../index";
import { UpdateInstanceNameInput } from "./instance.model";
import { setInstanceName } from "./instance.service";

/** Instance identity — app-owner only. Read it publicly via `setup.ssoStatus`. */
export const instanceRouter = {
	updateName: adminProcedure
		.input(UpdateInstanceNameInput)
		.handler(async ({ input }) => ({
			name: await setInstanceName(input.name),
		})),
};
