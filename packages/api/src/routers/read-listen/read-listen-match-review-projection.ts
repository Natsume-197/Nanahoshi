import type { LibraryScope } from "../_shared/library-scope";
import {
	type ReadListenRepository,
	readListenRepository,
} from "./read-listen.repository";
import {
	buildReadListenMatchProposalPageItem,
	type ReadListenMatchProposalView,
} from "./read-listen-match-view";
import { READ_LISTEN_MATCHER_VERSION } from "./read-listen-matcher";

type ProjectionStore = Pick<
	ReadListenRepository,
	"listMatchProposalPage" | "listPublicationsByIds"
>;

/** Produces an exact, editable review page; authorization is part of its scope. */
export class ReadListenMatchReviewProjection {
	constructor(private readonly store: ProjectionStore = readListenRepository) {}

	async list(input: {
		status: "pending" | "decided" | "superseded";
		query?: string;
		offset: number;
		limit: number;
		serverId: string;
		editableScope: LibraryScope;
	}): Promise<{ items: ReadListenMatchProposalView[]; total: number }> {
		const options = {
			status: input.status,
			query: input.query,
			matcherVersion:
				input.status === "pending" ? READ_LISTEN_MATCHER_VERSION : undefined,
		};
		const rows = await this.store.listMatchProposalPage(
			input.serverId,
			input.editableScope,
			{
				...options,
				offset: input.offset,
				limit: input.limit,
			},
		);
		let total = rows[0]?.totalCount ?? 0;
		if (rows.length === 0 && input.offset > 0) {
			const first = await this.store.listMatchProposalPage(
				input.serverId,
				input.editableScope,
				{
					...options,
					offset: 0,
					limit: 1,
				},
			);
			total = first[0]?.totalCount ?? 0;
		}
		const publicationIds = [
			...new Set(
				rows.flatMap((row) => [
					row.audiobookBookId,
					row.ebookBookId,
					...(row.selectedEbookBookId ? [row.selectedEbookBookId] : []),
				]),
			),
		];
		const publications = await this.store.listPublicationsByIds(
			publicationIds,
			input.serverId,
			input.editableScope,
		);
		const byId = new Map(
			publications.map((publication) => [publication.id, publication]),
		);
		return {
			items: rows.flatMap((row) => {
				const item = buildReadListenMatchProposalPageItem(row, byId);
				return item ? [item] : [];
			}),
			total,
		};
	}
}

export const readListenMatchReviewProjection =
	new ReadListenMatchReviewProjection();
