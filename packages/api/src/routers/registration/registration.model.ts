import z from "zod";

export const UpdateRegistrationInput = z.object({
	policy: z.enum(["invite-only", "closed"]),
	methods: z.object({
		email: z.boolean(),
		discord: z.boolean(),
	}),
});

export type UpdateRegistrationInputType = z.infer<
	typeof UpdateRegistrationInput
>;
