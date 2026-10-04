import z from "zod";
import { INSTANCE_NAME_MAX, normalizeInstanceName } from "./instance-name";

export const UpdateInstanceNameInput = z.object({
	name: z
		.string()
		.transform(normalizeInstanceName)
		.pipe(z.string().min(1).max(INSTANCE_NAME_MAX)),
});
