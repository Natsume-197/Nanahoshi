import { canAccessBookAction } from "../../auth/access.repository";
import { ForbiddenError, NotFoundError } from "../../errors";
import { orgReadProcedure } from "../../index";
import {
	AssociateReadListenPairInput,
	GenerateReadListenAlignmentInput,
	GetReadListenPairingsInput,
	GetReadListenSessionInput,
	ImportExistingReadListenAlignmentInput,
	RemoveReadListenPairInput,
	SearchReadListenCandidatesInput,
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
		listPairings: orgReadProcedure.handler(async ({ context }) => {
			const pairings = await service.listPairings(
				context.serverId,
				context.accessibleLibraryIds,
			);
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
