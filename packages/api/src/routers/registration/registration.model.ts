import z from "zod";

export const UpdateRegistrationInput = z.object({
	policy: z.enum(["invite-only", "closed"]),
	methods: z.object({
		email: z.boolean(),
		discord: z.boolean(),
		// Older clients don't send it; Google sign-up then stays as stored.
		google: z.boolean().default(true),
	}),
});

export type UpdateRegistrationInputType = z.infer<
	typeof UpdateRegistrationInput
>;
