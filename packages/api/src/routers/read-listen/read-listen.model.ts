import { z } from "zod";

export const GetReadListenPairingsInput = z.object({
	publicationUuid: z.string().uuid(),
});

export const ListReadListenPairingsInput = z.object({
	offset: z.number().int().min(0).default(0),
	limit: z.number().int().min(1).max(50).default(30),
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

export const RemoveReadListenPairInput = z.object({
	pairUuid: z.string().uuid(),
});

export const ImportExistingReadListenAlignmentInput = z.object({
	pairUuid: z.string().uuid(),
});

export const GenerateReadListenAlignmentInput = z.object({
	pairUuid: z.string().uuid(),
});

export const GetReadListenSessionInput = z.object({
	pairUuid: z.string().uuid(),
	ebookUuid: z.string().uuid(),
});
