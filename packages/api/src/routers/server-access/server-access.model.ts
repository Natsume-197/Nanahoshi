import { z } from "zod";

/** How new members can get into the organization. */
export const ACCESS_MODES = ["invite_only", "request", "discoverable"] as const;
export type AccessMode = (typeof ACCESS_MODES)[number];

export const SetAccessModeInput = z.object({
	mode: z.enum(ACCESS_MODES),
});
