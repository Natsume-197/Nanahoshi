import { z } from "zod";

export const CreateInviteLinkInput = z.object({
	role: z.enum(["member", "admin"]).default("member"),
	maxUses: z.number().int().positive().nullable().default(null),
	expiresIn: z.enum(["1d", "7d", "30d", "never"]).default("never"),
});

export const RevokeInviteLinkInput = z.object({ id: z.string() });

export const JoinInviteLinkInput = z.object({ code: z.string() });
