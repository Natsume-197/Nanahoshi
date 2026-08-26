import { canAccessBookAction } from "../../auth/access.repository";
import { ForbiddenError, NotFoundError } from "../../errors";
import { orgReadProcedure } from "../../index";
import {
	AssociateReadListenPairInput,
	DecideReadListenMatchProposalInput,
	GenerateReadListenAlignmentInput,
	GenerateReadListenMatchProposalBatchInput,
	GenerateReadListenMatchProposalsInput,
	GetReadListenAlignmentDiagnosticsInput,
	GetReadListenPairingsInput,
	GetReadListenSessionInput,
	GetTimedTextCandidatesInput,
	ImportExistingReadListenAlignmentInput,
	ListReadListenMatchProposalsInput,
	ListReadListenPairingsInput,
	RemoveReadListenPairInput,
	RemoveReadListenReviewedMatchInput,
	SearchReadListenCandidatesInput,
	SearchReadListenPairingsInput,
} from "./read-listen.model";
import { readListenService } from "./read-listen.service";

async function canEditPublications(
	session: Parameters<typeof canAccessBookAction>[0],
	publicationUuids: string[],
): Promise<boolean> {
	const permissions = await Promise.all(
		publicationUuids.map((uuid) =>
			canAccessBookAction(session, uuid, "book", "editMetadata"),
		),
	);
	return permissions.every(Boolean);
}

async function canReadPublications(
	session: Parameters<typeof canAccessBookAction>[0],
	publicationUuids: string[],
): Promise<boolean> {
	const permissions = await Promise.all(
		publicationUuids.map((uuid) =>
			canAccessBookAction(session, uuid, "book", "read"),
		),
	);
	return permissions.every(Boolean);
}

export function createReadListenRouter(
	service: typeof readListenService = readListenService,
) {
	return {
		listPairings: orgReadProcedure
			.input(ListReadListenPairingsInput)
			.handler(async ({ input, context }) => {
				const pairings = await service.listPairings(
					context.serverId,
					context.accessibleLibraryIds,
					{ offset: input.offset, limit: input.limit + 1 },
				);
				const hasMore = pairings.length > input.limit;
				const visible = await Promise.all(
					pairings
						.slice(0, input.limit)
						.map(async (pairing) =>
							(await canReadPublications(context.session, [
								pairing.ebook.uuid,
								pairing.audiobook.uuid,
							]))
								? pairing
								: null,
						),
				);
				return {
					items: visible.filter(
						(pairing): pairing is NonNullable<typeof pairing> =>
							pairing !== null,
					),
					nextOffset: hasMore ? input.offset + input.limit : null,
				};
			}),

		searchPairings: orgReadProcedure
			.input(SearchReadListenPairingsInput)
			.handler(async ({ input, context }) => {
				const pairings = await service.searchPairings({
					...input,
					serverId: context.serverId,
					scope: context.accessibleLibraryIds,
				});
				const visible = await Promise.all(
					pairings.map(async (pairing) =>
						(await canReadPublications(context.session, [
							pairing.ebook.uuid,
							pairing.audiobook.uuid,
						]))
							? pairing
							: null,
					),
				);
				return visible.filter(
					(pairing): pairing is NonNullable<typeof pairing> => pairing !== null,
				);
			}),

		getPairings: orgReadProcedure
			.input(GetReadListenPairingsInput)
			.handler(async ({ input, context }) => {
				if (
					!(await canReadPublications(context.session, [input.publicationUuid]))
				) {
					throw new ForbiddenError("You cannot read this publication");
				}
				const result = await service.getPairings(
					input.publicationUuid,
					context.serverId,
					context.accessibleLibraryIds,
				);
				const visible = await Promise.all(
					result.pairings.map(async (pairing) =>
						(await canReadPublications(context.session, [
							pairing.ebook.uuid,
							pairing.audiobook.uuid,
						]))
							? pairing
							: null,
					),
				);
				return {
					...result,
					pairings: visible.filter(
						(pairing): pairing is NonNullable<typeof pairing> =>
							pairing !== null,
					),
				};
			}),

		getSession: orgReadProcedure
			.input(GetReadListenSessionInput)
			.handler(async ({ input, context }) => {
				const pair = await service.getPairForManagement(
					input.pairUuid,
					context.serverId,
					context.accessibleLibraryIds,
				);
				if (pair.ebook.uuid !== input.ebookUuid) {
					throw new NotFoundError(
						"Read & Listen pair not found for this ebook",
					);
				}
				if (
					!(await canReadPublications(context.session, [
						pair.ebook.uuid,
						pair.audiobook.uuid,
					]))
				) {
					throw new ForbiddenError(
						"You cannot read one of these Read & Listen publications",
					);
				}
				return service.getSession(
					input.pairUuid,
					context.serverId,
					context.accessibleLibraryIds,
				);
			}),

		searchCandidates: orgReadProcedure
			.input(SearchReadListenCandidatesInput)
			.handler(async ({ input, context }) => {
				if (
					!(await canReadPublications(context.session, [input.publicationUuid]))
				) {
					throw new ForbiddenError("You cannot read this publication");
				}
				const result = await service.searchCandidates({
					...input,
					serverId: context.serverId,
					scope: context.accessibleLibraryIds,
				});
				const visible = await Promise.all(
					result.candidates.map(async (candidate) =>
						(await canReadPublications(context.session, [candidate.uuid]))
							? candidate
							: null,
					),
				);
				return {
					...result,
					candidates: visible.filter(
						(candidate): candidate is NonNullable<typeof candidate> =>
							candidate !== null,
					),
				};
			}),

		associate: orgReadProcedure
			.input(AssociateReadListenPairInput)
			.handler(async ({ input, context }) => {
				if (
					!(await canEditPublications(context.session, [
						input.publicationUuid,
						input.candidateUuid,
					]))
				) {
					throw new ForbiddenError(
						"You cannot associate one of these publications",
					);
				}

				return service.associate({
					...input,
					createdByUserId: context.session.user.id,
					serverId: context.serverId,
					scope: context.accessibleLibraryIds,
				});
			}),

		generateMatchProposals: orgReadProcedure
			.input(GenerateReadListenMatchProposalsInput)
			.handler(async ({ input, context }) => {
				if (
					!(await canEditPublications(context.session, [input.audiobookUuid]))
				) {
					throw new ForbiddenError(
						"You cannot generate match proposals for this audiobook",
					);
				}
				return service.generateMatchProposals({
					...input,
					serverId: context.serverId,
					scope: context.accessibleLibraryIds,
				});
			}),

		generateMatchProposalBatch: orgReadProcedure
			.input(GenerateReadListenMatchProposalBatchInput)
			.handler(async ({ input, context }) => {
				const candidates = await service.listMatchBatchCandidates(
					context.serverId,
					context.accessibleLibraryIds,
					Math.min(input.limit * 4, 100),
				);
				const editable = await Promise.all(
					candidates.map(async (candidate) =>
						(await canEditPublications(context.session, [candidate.uuid]))
							? candidate.uuid
							: null,
					),
				);
				return service.generateMatchProposalBatch({
					audiobookUuids: editable
						.filter((uuid): uuid is NonNullable<typeof uuid> => uuid !== null)
						.slice(0, input.limit),
					serverId: context.serverId,
					scope: context.accessibleLibraryIds,
				});
			}),

		listMatchProposals: orgReadProcedure
			.input(ListReadListenMatchProposalsInput)
			.handler(async ({ input, context }) => {
				const page = await service.listMatchProposalPage({
					...input,
					serverId: context.serverId,
					scope: context.accessibleLibraryIds,
				});
				const visible = await Promise.all(
					page.items.map(async (proposal) =>
						(await canEditPublications(context.session, [
							proposal.audiobook.uuid,
							proposal.ebook.uuid,
							...(proposal.decision?.selectedEbook
								? [proposal.decision.selectedEbook.uuid]
								: []),
						]))
							? proposal
							: null,
					),
				);
				return {
					items: visible.filter(
						(proposal): proposal is NonNullable<typeof proposal> =>
							proposal !== null,
					),
					total: page.total,
				};
			}),

		decideMatchProposal: orgReadProcedure
			.input(DecideReadListenMatchProposalInput)
			.handler(async ({ input, context }) => {
				const proposal = await service.getMatchProposalForReview(
					input.proposalUuid,
					context.serverId,
					context.accessibleLibraryIds,
				);
				const publicationUuids = [
					proposal.audiobook.uuid,
					proposal.ebook.uuid,
					...(input.action === "correct" ? [input.selectedEbookUuid] : []),
				];
				if (!(await canEditPublications(context.session, publicationUuids))) {
					throw new ForbiddenError(
						"You cannot decide this Read & Listen match proposal",
					);
				}
				return service.decideMatchProposal({
					...input,
					decidedByUserId: context.session.user.id,
					serverId: context.serverId,
					scope: context.accessibleLibraryIds,
				});
			}),

		removeReviewedMatch: orgReadProcedure
			.input(RemoveReadListenReviewedMatchInput)
			.handler(async ({ input, context }) => {
				const proposal = await service.getMatchProposalForReview(
					input.proposalUuid,
					context.serverId,
					context.accessibleLibraryIds,
				);
				if (
					!(await canEditPublications(context.session, [
						proposal.audiobook.uuid,
						proposal.ebook.uuid,
					]))
				) {
					throw new ForbiddenError(
						"You cannot remove this Read & Listen match review",
					);
				}
				return service.removeReviewedMatch(
					input.proposalUuid,
					context.serverId,
					context.accessibleLibraryIds,
				);
			}),

		importExistingAlignment: orgReadProcedure
			.input(ImportExistingReadListenAlignmentInput)
			.handler(async ({ input, context }) => {
				const pair = await service.getPairForManagement(
					input.pairUuid,
					context.serverId,
					context.accessibleLibraryIds,
				);
				if (
					!(await canEditPublications(context.session, [
						pair.ebook.uuid,
						pair.audiobook.uuid,
					]))
				) {
					throw new ForbiddenError(
						"You cannot import an alignment for this Read & Listen pair",
					);
				}

				return service.importExistingAlignment(
					input.pairUuid,
					context.serverId,
					context.accessibleLibraryIds,
				);
			}),

		generateAlignment: orgReadProcedure
			.input(GenerateReadListenAlignmentInput)
			.handler(async ({ input, context }) => {
				const pair = await service.getPairForManagement(
					input.pairUuid,
					context.serverId,
					context.accessibleLibraryIds,
				);
				if (
					!(await canEditPublications(context.session, [
						pair.ebook.uuid,
						pair.audiobook.uuid,
					]))
				) {
					throw new ForbiddenError(
						"You cannot generate an alignment for this Read & Listen pair",
					);
				}

				return service.generateAlignment(
					input.pairUuid,
					context.session.user.id,
					context.serverId,
					context.accessibleLibraryIds,
					{
						mode: input.mode,
						timedTextFilenames: input.timedTextFilenames,
						verifyTimedText: input.verifyTimedText,
					},
				);
			}),

		getTimedTextCandidates: orgReadProcedure
			.input(GetTimedTextCandidatesInput)
			.handler(async ({ input, context }) => {
				const pair = await service.getPairForManagement(
					input.pairUuid,
					context.serverId,
					context.accessibleLibraryIds,
				);
				if (
					!(await canEditPublications(context.session, [
						pair.ebook.uuid,
						pair.audiobook.uuid,
					]))
				) {
					throw new ForbiddenError(
						"You cannot inspect timed text for this Read & Listen pair",
					);
				}
				return service.getTimedTextCandidates(
					input.pairUuid,
					context.serverId,
					context.accessibleLibraryIds,
				);
			}),

		getAlignmentDiagnostics: orgReadProcedure
			.input(GetReadListenAlignmentDiagnosticsInput)
			.handler(async ({ input, context }) => {
				const pair = await service.getPairForManagement(
					input.pairUuid,
					context.serverId,
					context.accessibleLibraryIds,
				);
				if (
					!(await canReadPublications(context.session, [
						pair.ebook.uuid,
						pair.audiobook.uuid,
					]))
				) {
					throw new ForbiddenError(
						"You cannot inspect this Read & Listen alignment",
					);
				}
				return service.getAlignmentDiagnostics(
					input.pairUuid,
					context.serverId,
					context.accessibleLibraryIds,
				);
			}),

		remove: orgReadProcedure
			.input(RemoveReadListenPairInput)
			.handler(async ({ input, context }) => {
				const pair = await service.getPairForManagement(
					input.pairUuid,
					context.serverId,
					context.accessibleLibraryIds,
				);
				if (
					!(await canEditPublications(context.session, [
						pair.ebook.uuid,
						pair.audiobook.uuid,
					]))
				) {
					throw new ForbiddenError("You cannot remove this Read & Listen pair");
				}

				return service.removePair(
					input.pairUuid,
					context.serverId,
					context.accessibleLibraryIds,
				);
			}),
	};
}

export const readListenRouter = createReadListenRouter();
