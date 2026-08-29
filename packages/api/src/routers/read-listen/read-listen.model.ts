import { z } from "zod";

export const GetReadListenPairingsInput = z.object({
	publicationUuid: z.string().uuid(),
});

export const ListReadListenPairingsInput = z.object({
	offset: z.number().int().min(0).default(0),
	limit: z.number().int().min(1).max(50).default(30),
	alignment: z.enum(["any", "ready", "not_imported", "stale"]).default("ready"),
});

export const SearchReadListenPairingsInput = z.object({
	query: z.string().trim().min(1).max(200),
	limit: z.number().int().min(1).max(30).default(20),
});

export const SearchReadListenCandidatesInput = z.object({
	publicationUuid: z.string().uuid(),
	query: z.string().trim().min(1).max(200),
	limit: z.number().int().min(1).max(20).default(8),
});

export const AssociateReadListenPairInput = z.object({
	publicationUuid: z.string().uuid(),
	candidateUuid: z.string().uuid(),
});

export const GenerateReadListenMatchProposalsInput = z.object({
	audiobookUuid: z.string().uuid(),
	limit: z.number().int().min(1).max(10).default(5),
});

export const StartReadListenMatchAnalysisInput = z.object({});

export const ListReadListenMatchProposalsInput = z.object({
	status: z.enum(["pending", "decided", "superseded"]).default("pending"),
	query: z.string().trim().max(200).optional(),
	offset: z.number().int().min(0).default(0),
	limit: z.number().int().min(1).max(50).default(30),
});

export const DecideReadListenMatchProposalInput = z.discriminatedUnion(
	"action",
	[
		z.object({ proposalUuid: z.string().uuid(), action: z.literal("approve") }),
		z.object({ proposalUuid: z.string().uuid(), action: z.literal("reject") }),
		z.object({
			proposalUuid: z.string().uuid(),
			action: z.literal("correct"),
			selectedEbookUuid: z.string().uuid(),
		}),
	],
);

export const DecideReadListenMatchProposalsInput = z.object({
	target: z.union([
		z.object({ proposalUuids: z.array(z.string().uuid()).min(1).max(50) }),
		z.object({
			filter: z.object({
				status: z.literal("pending"),
				query: z.string().trim().max(200).optional(),
			}),
		}),
	]),
	action: z.enum(["approve", "reject"]),
});

export const RemoveReadListenPairInput = z.object({
	pairUuid: z.string().uuid(),
});

export const RemoveReadListenReviewedMatchesInput = z.union([
	z.object({ proposalUuids: z.array(z.string().uuid()).min(1).max(50) }),
	z.object({
		filter: z.object({
			status: z.enum(["pending", "decided"]),
			query: z.string().trim().max(200).optional(),
		}),
	}),
]);

export const ImportExistingReadListenAlignmentInput = z.object({
	pairUuid: z.string().uuid(),
});

export const GetTimedTextCandidatesInput = z.object({
	pairUuid: z.string().uuid(),
});

export const GetReadListenAlignmentDiagnosticsInput = z.object({
	pairUuid: z.string().uuid(),
});

export const GenerateReadListenAlignmentInput = z
	.object({
		pairUuid: z.string().uuid(),
		mode: z.enum(["provider", "timed-text"]).default("provider"),
		timedTextFilenames: z.array(z.string().min(1).max(255)).max(100).optional(),
		verifyTimedText: z.boolean().default(false),
	})
	.superRefine((input, context) => {
		if (input.mode === "timed-text" && !input.timedTextFilenames?.length) {
			context.addIssue({
				code: "custom",
				message: "Timed-text generation requires an SRT selection",
				path: ["timedTextFilenames"],
			});
		}
		if (input.mode === "provider" && input.timedTextFilenames !== undefined) {
			context.addIssue({
				code: "custom",
				message: "Provider generation cannot include timed-text files",
				path: ["timedTextFilenames"],
			});
		}
		if (input.mode === "provider" && input.verifyTimedText) {
			context.addIssue({
				code: "custom",
				message: "Provider generation cannot verify timed-text files",
				path: ["verifyTimedText"],
			});
		}
	});

export const GetReadListenSessionInput = z.object({
	pairUuid: z.string().uuid(),
	ebookUuid: z.string().uuid(),
});
