import type {
	ReadListenMatchProposalPageRow,
	ReadListenMatchProposalRow,
	ReadListenPublication,
} from "./read-listen.repository";

export type ReadListenPublicationView = Omit<
	ReadListenPublication,
	"id" | "catalogHash"
>;

export type ReadListenMatchProposalView = {
	id: string;
	origin: "matcher" | "manual";
	score: number | null;
	confidence: ReadListenMatchProposalRow["confidence"] | null;
	reasons: string[];
	warnings: string[];
	matcherVersion: string | null;
	status: ReadListenMatchProposalRow["status"];
	createdAt: string;
	removable: boolean;
	audiobook: ReadListenPublicationView;
	ebook: ReadListenPublicationView;
	decision: {
		action: "approve" | "reject" | "correct";
		selectedEbook: ReadListenPublicationView | null;
		pairUuid: string | null;
	} | null;
};

export function toReadListenPublicationView(
	publication: ReadListenPublication,
): ReadListenPublicationView {
	const { catalogHash: _catalogHash, id: _id, ...view } = publication;
	return view;
}

export function buildReadListenMatchProposal(
	row: ReadListenMatchProposalRow,
	publications: Map<number, ReadListenPublication>,
): ReadListenMatchProposalView | null {
	const audiobook = publications.get(row.audiobookBookId);
	const ebook = publications.get(row.ebookBookId);
	if (
		!audiobook ||
		!ebook ||
		audiobook.mediaType !== "audiobook" ||
		ebook.mediaType !== "ebook"
	) {
		return null;
	}
	return {
		id: row.id,
		origin: "matcher",
		score: row.score,
		confidence: row.confidence,
		reasons: row.reasons,
		warnings: row.warnings,
		matcherVersion: row.matcherVersion,
		status: row.status,
		createdAt: row.createdAt,
		removable: row.status !== "superseded",
		audiobook: toReadListenPublicationView(audiobook),
		ebook: toReadListenPublicationView(ebook),
		decision: null,
	};
}

export function buildReadListenMatchProposalPageItem(
	row: ReadListenMatchProposalPageRow,
	publications: Map<number, ReadListenPublication>,
): ReadListenMatchProposalView | null {
	if (row.origin === "manual") {
		const audiobook = publications.get(row.audiobookBookId);
		const ebook = publications.get(row.ebookBookId);
		if (
			!audiobook ||
			!ebook ||
			audiobook.mediaType !== "audiobook" ||
			ebook.mediaType !== "ebook"
		) {
			return null;
		}
		return {
			id: row.id,
			origin: "manual",
			score: null,
			confidence: null,
			reasons: [],
			warnings: [],
			matcherVersion: null,
			status: "decided",
			createdAt: row.createdAt,
			removable: true,
			audiobook: toReadListenPublicationView(audiobook),
			ebook: toReadListenPublicationView(ebook),
			decision: {
				action: "approve",
				selectedEbook: toReadListenPublicationView(ebook),
				pairUuid: row.pairId,
			},
		};
	}

	const proposal = buildReadListenMatchProposal(row, publications);
	if (!proposal || !row.decisionAction) return proposal;
	const selectedEbook = row.selectedEbookBookId
		? publications.get(row.selectedEbookBookId)
		: undefined;
	if (
		row.selectedEbookBookId !== null &&
		selectedEbook?.mediaType !== "ebook"
	) {
		return null;
	}
	return {
		...proposal,
		removable: row.decisionAction === "reject" || row.pairId !== null,
		decision: {
			action: row.decisionAction,
			selectedEbook:
				selectedEbook?.mediaType === "ebook"
					? toReadListenPublicationView(selectedEbook)
					: null,
			pairUuid: row.pairId,
		},
	};
}
