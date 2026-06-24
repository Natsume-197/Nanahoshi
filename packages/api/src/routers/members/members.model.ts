import { z } from "zod";

export const TargetUserInput = z.object({ targetUserId: z.string() });
