import { z } from "zod";

export const TaskIdInput = z.object({ taskId: z.string() });
