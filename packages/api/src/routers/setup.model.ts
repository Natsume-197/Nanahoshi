import { z } from "zod";

export const CompleteSetupInput = z.object({
	workspaceName: z.string().min(1),
	workspaceSlug: z.string().min(1),
	username: z.string().min(1),
	email: z.string().email(),
	password: z.string().min(8),
});
