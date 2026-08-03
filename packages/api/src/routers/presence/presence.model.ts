import { z } from "zod";
import { MANUAL_PRESENCE_STATUSES } from "../../modules/presence/presence.types";

export const SetStatusInput = z.object({
	status: z.enum(MANUAL_PRESENCE_STATUSES),
});

export const SetIdleInput = z.object({
	idle: z.boolean(),
});
