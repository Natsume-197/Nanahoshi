import { z } from "zod";

export const SendToKindleInput = z.object({
	bookUuid: z.string(),
	kindleEmail: z.string().email(),
});
