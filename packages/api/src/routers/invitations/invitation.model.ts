import { z } from "zod";

export const InviteMemberInput = z.object({
	email: z.string().email("Valid email required"),
	role: z.enum(["member", "admin"]).default("member"),
});

export const CancelInvitationInput = z.object({
	invitationId: z.string(),
});
