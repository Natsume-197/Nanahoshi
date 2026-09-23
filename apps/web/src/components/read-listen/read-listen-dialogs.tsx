import {
	CaretLeft,
	CaretRight,
	Check,
	MagnifyingGlass,
	Trash,
	X,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { formatNames, formatReadingTime } from "@/utils/format";
import { type client, orpc } from "@/utils/orpc";
import {
	getMatchWarningLabel,
	MatchPublicationArtwork,
	type ReadListenPublicationView as Publication,
	PublicationLink,
} from "./read-listen-publication";
import { languageName, matchReasonLabels } from "./read-listen-reasons";

export type ReadListenCandidate = Awaited<
	ReturnType<typeof client.readListen.searchCandidates>
>["candidates"][number];
type Candidate = ReadListenCandidate;

// ─── Picking an ebook for an audiobook ────────────────────

function PublicationSummary({
	publication,
	mediaType,
}: {
	publication: Publication;
	mediaType: "ebook" | "audiobook";
}) {
	const series = publication.series[0];
	const meta = [
		formatNames(publication.authors),
		series
			? `${series.name}${series.position != null ? ` #${series.position}` : ""}`
			: null,
		publication.libraryName,
	].filter(Boolean);
	return (
		<span className="flex min-w-0 items-center gap-3">
			<MatchPublicationArtwork
				cover={publication.cover}
				mediaType={mediaType}
			/>
			<span className="min-w-0">
				<span
					title={publication.title}
					className="block truncate font-medium text-sm"
				>
					{publication.title}
				</span>
				<span className="block truncate text-muted-foreground text-xs">
					{meta.join(" · ") || publication.filename}
				</span>
			</span>
		</span>
	);
}

export function EbookPickerDialog({
	audiobook,
	title,
	description,
	suggestions = [],
	excludeUuids = [],
	isPending,
	onOpenChange,
	onSelect,
}: {
	audiobook: Publication;
	title: string;
	description: string;
	/** Other ebooks the matcher proposed for this audiobook, shown first. */
	suggestions?: Publication[];
	excludeUuids?: string[];
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (ebook: Candidate) => void;
}) {
	const inputId = useId();
	const [query, setQuery] = useState(audiobook.title);
	const debouncedQuery = useDebounce(query.trim(), 300);
	const candidatesQuery = useQuery({
		...orpc.readListen.searchCandidates.queryOptions({
			input: {
				publicationUuid: audiobook.uuid,
				query: debouncedQuery || audiobook.title,
				limit: 8,
			},
		}),
		enabled: debouncedQuery.length > 0,
	});
	const hidden = new Set([
		...excludeUuids,
		...suggestions.map((entry) => entry.uuid),
	]);
	const candidates = (candidatesQuery.data?.candidates ?? []).filter(
		(candidate) => !hidden.has(candidate.uuid),
	);
	const option = (candidate: Candidate, paired: boolean) => (
		<button
			type="button"
			key={candidate.uuid}
			disabled={isPending || paired}
			onClick={() => onSelect(candidate)}
			className="flex w-full items-center justify-between gap-3 rounded-xl bg-muted/45 p-3 text-start transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
		>
			<PublicationSummary publication={candidate} mediaType="ebook" />
			{paired && (
				<span className="shrink-0 text-muted-foreground text-xs">
					{m["read_listen.already_paired"]()}
				</span>
			)}
		</button>
	);

	return (
		<Modal
			open
			onOpenChange={(open) => {
				if (!isPending) onOpenChange(open);
			}}
			title={title}
			description={description}
			className="sm:max-w-xl"
		>
			<div className="flex flex-col gap-4">
				<div className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
					<PublicationSummary publication={audiobook} mediaType="audiobook" />
				</div>
				{suggestions.length > 0 && (
					<section className="flex flex-col gap-2">
						<h3 className="font-medium text-muted-foreground text-xs">
							{m["read_listen.suggested_ebooks"]()}
						</h3>
						{suggestions.map((suggestion) =>
							option({ ...suggestion, isPaired: false }, false),
						)}
					</section>
				)}
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor={inputId}>
							{m["read_listen.search_ebook_label"]()}
						</FieldLabel>
						<Input
							id={inputId}
							type="search"
							name="ebook-search"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder={m["read_listen.search_placeholder"]()}
							className="h-10! sm:h-8!"
						/>
					</Field>
				</FieldGroup>
				<section className="flex flex-col gap-2">
					{suggestions.length > 0 && (
						<h3 className="font-medium text-muted-foreground text-xs">
							{m["read_listen.search_results"]()}
						</h3>
					)}
					{candidatesQuery.isFetching
						? [0, 1, 2].map((key) => (
								<Skeleton key={key} className="h-[68px] rounded-xl" />
							))
						: candidates.length > 0
							? candidates.map((candidate) =>
									option(candidate, candidate.isPaired),
								)
							: debouncedQuery && (
									<p className="py-6 text-muted-foreground text-sm">
										{m["read_listen.no_matches"]()}
									</p>
								)}
				</section>
			</div>
		</Modal>
	);
}

// ─── One proposal, side by side ───────────────────────────

type ProposalLike = {
	id: string;
	score: number | null;
	confidence: "high" | "medium" | "low" | null;
	reasons: string[];
	warnings: string[];
	origin: "matcher" | "manual";
	audiobook: Publication;
	ebook: Publication;
	decision: { selectedEbook: Publication | null } | null;
};

function ComparisonRow({
	label,
	audiobook,
	ebook,
}: {
	label: string;
	audiobook: ReactNode;
	ebook: ReactNode;
}) {
	return (
		<>
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd className="min-w-0 break-words text-sm">{audiobook ?? "—"}</dd>
			<dd className="min-w-0 break-words text-sm">{ebook ?? "—"}</dd>
		</>
	);
}

function seriesText(publication: Publication): string | null {
	const series = publication.series[0];
	if (!series) return null;
	return `${series.name}${series.position != null ? ` #${series.position}` : ""}`;
}

export function ProposalDetailDialog({
	proposal,
	onClose,
	onPrevious,
	onNext,
	actions,
}: {
	proposal: ProposalLike;
	onClose: () => void;
	onPrevious?: () => void;
	onNext?: () => void;
	/** Present only while the proposal still awaits a decision. */
	actions?: {
		busy: boolean;
		onApprove: () => void;
		onReject: () => void;
		onChooseAnother: () => void;
		/** Drops the proposal without deciding it (only matcher results). */
		onRemove?: () => void;
	};
}) {
	const ebook = proposal.decision?.selectedEbook ?? proposal.ebook;
	const { audiobook } = proposal;
	const reasons = matchReasonLabels(proposal.reasons);
	const warnings = proposal.warnings.flatMap((warning) => {
		const label = getMatchWarningLabel(warning);
		return label ? [label] : [];
	});
	return (
		<Modal
			open
			onOpenChange={(open) => !open && onClose()}
			title={m["read_listen.detail_title"]()}
			description={audiobook.title}
			className="sm:max-w-2xl"
		>
			<div className="flex flex-col gap-5">
				{(onPrevious || onNext) && (
					<div className="-mt-2 flex justify-end gap-0.5">
						<Button
							size="icon-sm"
							variant="ghost"
							onClick={onPrevious}
							disabled={!onPrevious}
							aria-label={m["read_listen.previous_match"]()}
						>
							<CaretLeft />
						</Button>
						<Button
							size="icon-sm"
							variant="ghost"
							onClick={onNext}
							disabled={!onNext}
							aria-label={m["read_listen.next_match"]()}
						>
							<CaretRight />
						</Button>
					</div>
				)}
				<dl className="grid grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)] items-start gap-x-4 gap-y-2.5">
					<span />
					<dd className="flex flex-col gap-2">
						<span className="text-muted-foreground text-xs">
							{m["read_listen.audiobook"]()}
						</span>
						<PublicationLink publication={audiobook} mediaType="audiobook" />
					</dd>
					<dd className="flex flex-col gap-2">
						<span className="text-muted-foreground text-xs">
							{m["read_listen.ebook"]()}
						</span>
						<PublicationLink publication={ebook} mediaType="ebook" />
					</dd>
					<ComparisonRow
						label={m["read_listen.field_authors"]()}
						audiobook={formatNames(audiobook.authors) || null}
						ebook={formatNames(ebook.authors) || null}
					/>
					<ComparisonRow
						label={m["read_listen.field_series"]()}
						audiobook={seriesText(audiobook)}
						ebook={seriesText(ebook)}
					/>
					<ComparisonRow
						label={m["read_listen.field_narrators"]()}
						audiobook={formatNames(audiobook.narrators) || null}
						ebook={null}
					/>
					<ComparisonRow
						label={m["read_listen.field_duration"]()}
						audiobook={
							audiobook.duration ? formatReadingTime(audiobook.duration) : null
						}
						ebook={null}
					/>
					<ComparisonRow
						label={m["read_listen.field_language"]()}
						audiobook={languageName(audiobook.languageCode, getLocale())}
						ebook={languageName(ebook.languageCode, getLocale())}
					/>
					<ComparisonRow
						label={m["read_listen.field_library"]()}
						audiobook={audiobook.libraryName}
						ebook={ebook.libraryName}
					/>
				</dl>

				{proposal.origin === "matcher" && (
					<section className="flex flex-col gap-2">
						<div className="flex flex-wrap items-center gap-1.5">
							<Badge
								variant={proposal.confidence === "high" ? "success" : "warning"}
							>
								{m["read_listen.match_score"]({ score: proposal.score ?? 0 })}
							</Badge>
						</div>
						{reasons.length > 0 && (
							<div className="flex flex-col gap-1.5">
								<h3 className="font-medium text-muted-foreground text-xs">
									{m["read_listen.reasons_title"]()}
								</h3>
								<div className="flex flex-wrap gap-1.5">
									{reasons.map((label) => (
										<Badge key={label} variant="secondary">
											{label}
										</Badge>
									))}
								</div>
							</div>
						)}
						{warnings.length > 0 && (
							<div className="flex flex-col gap-1.5">
								<h3 className="font-medium text-muted-foreground text-xs">
									{m["read_listen.warnings_title"]()}
								</h3>
								<div className="flex flex-wrap gap-1.5">
									{warnings.map((label) => (
										<Badge key={label} variant="warning">
											{label}
										</Badge>
									))}
								</div>
							</div>
						)}
					</section>
				)}

				{actions && (
					<div className="flex flex-wrap items-center gap-1.5 border-border/60 border-t pt-4">
						<Button disabled={actions.busy} onClick={actions.onApprove}>
							<Check data-icon="inline-start" />
							{m["read_listen.approve_match"]()}
						</Button>
						<Button
							variant="outline"
							disabled={actions.busy}
							onClick={actions.onChooseAnother}
						>
							<MagnifyingGlass data-icon="inline-start" />
							{m["read_listen.choose_another_ebook"]()}
						</Button>
						<span className="ms-auto flex flex-wrap items-center gap-1.5">
							{actions.onRemove && (
								<Button
									variant="ghost"
									className="text-muted-foreground"
									disabled={actions.busy}
									onClick={actions.onRemove}
								>
									<Trash data-icon="inline-start" />
									{m["read_listen.remove_pending_result"]()}
								</Button>
							)}
							<Button
								variant="ghost"
								className="text-destructive"
								disabled={actions.busy}
								onClick={actions.onReject}
							>
								<X data-icon="inline-start" />
								{m["read_listen.reject_match"]()}
							</Button>
						</span>
					</div>
				)}
			</div>
		</Modal>
	);
}
