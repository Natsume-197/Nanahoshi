import { z } from "zod";

export const ListSecurityAuditInput = z
	.object({
		outcome: z.enum(["success", "failure"]).optional(),
		userId: z.string().trim().min(1).optional(),
		device: z.string().trim().min(1).max(500).optional(),
		serverId: z.string().trim().min(1).optional(),
		cursor: z.number().int().positive().optional(),
		limit: z.number().int().min(1).max(100).default(50),
	})
	.optional();

export const RevokeSessionInput = z.object({
	sessionId: z.string().min(1),
});
