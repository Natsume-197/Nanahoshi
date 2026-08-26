import { BadRequestError, ConflictError, NotFoundError } from "../../errors";
import type { LibraryScope } from "../_shared/library-scope";
import {
	type ReadListenMatchProposalRow,
	type ReadListenRepository,
	readListenRepository,
} from "./read-listen.repository";
import { READ_LISTEN_MATCHER_VERSION } from "./read-listen-matcher";

type ReviewStore = Pick<
	ReadListenRepository,
	| "getMatchProposalRow"
	| "getPairRow"
	| "getPublicationByUuid"
	| "listPublicationsByIds"
	| "listMatchProposalPage"
	| "decideMatchProposals"
	| "deleteReviewedMatches"
>;

type ReviewDecision = {
	proposalUuid: string;
	action: "approve" | "reject" | "correct";
	selectedEbookUuid?: string;
};

type ReviewFilter = {
	status: "pending" | "decided";
	query?: string;
};

type ReviewTarget = { proposalUuids: string[] } | { filter: ReviewFilter };

/** Owns the complete proposal -> decision -> pair lifecycle and its undo path. */
export class ReadListenMatchReviewLifecycle {
	constructor(private readonly store: ReviewStore = readListenRepository) {}

	private async resolveTarget(input: {
		target: ReviewTarget;
		serverId: string;
		scope: LibraryScope;
	}): Promise<string[]> {
		if ("proposalUuids" in input.target) return input.target.proposalUuids;
		const ids: string[] = [];
		const pageSize = 500;
		for (let offset = 0; ; offset += pageSize) {
			const rows = await this.store.listMatchProposalPage(
				input.serverId,
				input.scope,
				{
					...input.target.filter,
					matcherVersion:
						input.target.filter.status === "pending"
							? READ_LISTEN_MATCHER_VERSION
							: undefined,
					offset,
					limit: pageSize,
				},
			);
			ids.push(...rows.map((row) => row.id));
			if (rows.length < pageSize) break;
		}
		if (ids.length === 0) {
			throw new NotFoundError("No Read & Listen matches satisfy the filter");
		}
		return ids;
	}

	async decideSelection(input: {
		target: ReviewTarget;
		action: "approve" | "reject";
		decidedByUserId: string;
		serverId: string;
		scope: LibraryScope;
	}) {
		const proposalUuids = await this.resolveTarget(input);
		return this.decide({
			decisions: proposalUuids.map((proposalUuid) => ({
				proposalUuid,
				action: input.action,
			})),
			decidedByUserId: input.decidedByUserId,
			serverId: input.serverId,
			scope: input.scope,
		});
	}

	async decide(input: {
		decisions: ReviewDecision[];
		decidedByUserId: string;
		serverId: string;
		scope: LibraryScope;
	}) {
		if (input.decisions.length === 0) {
			throw new BadRequestError("At least one match decision is required");
		}
		const uniqueIds = new Set(input.decisions.map((item) => item.proposalUuid));
		if (uniqueIds.size !== input.decisions.length) {
			throw new BadRequestError("A match proposal may only be decided once");
		}

		const prepared: Array<{
			proposal: ReadListenMatchProposalRow;
			action: ReviewDecision["action"];
			selectedEbookBookId: number | null;
			decidedByUserId: string;
		}> = [];
		for (const decision of input.decisions) {
			const proposal = await this.store.getMatchProposalRow(
				decision.proposalUuid,
				input.serverId,
			);
			if (!proposal)
				throw new NotFoundError("Read & Listen match proposal not found");
			if (proposal.status !== "pending") {
				throw new ConflictError(
					"Read & Listen match proposal was already decided",
				);
			}
			const sources = await this.store.listPublicationsByIds(
				[proposal.audiobookBookId, proposal.ebookBookId],
				input.serverId,
				input.scope,
			);
			if (sources.length !== 2) {
				throw new NotFoundError("Read & Listen match proposal not found");
			}

			let selectedEbookBookId: number | null = null;
			if (decision.action === "approve")
				selectedEbookBookId = proposal.ebookBookId;
			if (decision.action === "correct") {
				if (!decision.selectedEbookUuid) {
					throw new BadRequestError("A corrected proposal requires an ebook");
				}
				const selected = await this.store.getPublicationByUuid(
					decision.selectedEbookUuid,
					input.serverId,
					input.scope,
				);
				if (selected?.mediaType !== "ebook") {
					throw new BadRequestError(
						"A corrected match must select an editable ebook",
					);
				}
				if (selected.id === proposal.ebookBookId) {
					throw new BadRequestError(
						"Approve the proposal when the suggested ebook is correct",
					);
				}
				selectedEbookBookId = selected.id;
			}
			prepared.push({
				proposal,
				action: decision.action,
				selectedEbookBookId,
				decidedByUserId: input.decidedByUserId,
			});
		}

		const pairingAudiobooks = prepared
			.filter((item) => item.selectedEbookBookId !== null)
			.map((item) => item.proposal.audiobookBookId);
		if (new Set(pairingAudiobooks).size !== pairingAudiobooks.length) {
			throw new ConflictError(
				"Only one proposal per audiobook may be approved in the same review",
			);
		}

		try {
			const outcomes = await this.store.decideMatchProposals(prepared);
			return outcomes.map((outcome) => ({
				decision: outcome.decision,
				pairUuid: outcome.pair?.id ?? null,
			}));
		} catch (error) {
			throw new ConflictError(
				error instanceof Error ? error.message : "Match review conflicted",
			);
		}
	}

	async remove(input: {
		reviewIds: string[];
		serverId: string;
		scope: LibraryScope;
	}) {
		const ids = [...new Set(input.reviewIds)];
		if (ids.length !== input.reviewIds.length || ids.length === 0) {
			throw new BadRequestError(
				"Reviewed matches must be unique and non-empty",
			);
		}
		for (const id of ids) {
			const proposal = await this.store.getMatchProposalRow(id, input.serverId);
			const pair = proposal
				? null
				: await this.store.getPairRow(id, input.serverId);
			const publicationIds = proposal
				? [proposal.audiobookBookId, proposal.ebookBookId]
				: pair
					? [pair.audiobookBookId, pair.ebookBookId]
					: [];
			if (publicationIds.length !== 2) {
				throw new NotFoundError("Reviewed Read & Listen match not found");
			}
			const visible = await this.store.listPublicationsByIds(
				publicationIds,
				input.serverId,
				input.scope,
			);
			if (visible.length !== 2) {
				throw new NotFoundError("Reviewed Read & Listen match not found");
			}
		}
		try {
			return {
				removedCount: await this.store.deleteReviewedMatches(
					ids,
					input.serverId,
				),
			};
		} catch (error) {
			throw new ConflictError(
				error instanceof Error ? error.message : "Match removal conflicted",
			);
		}
	}

	async removeSelection(input: {
		target: ReviewTarget;
		serverId: string;
		scope: LibraryScope;
	}) {
		return this.remove({
			reviewIds: await this.resolveTarget(input),
			serverId: input.serverId,
			scope: input.scope,
		});
	}
}

export const readListenMatchReviewLifecycle =
	new ReadListenMatchReviewLifecycle();
