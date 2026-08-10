import {
	BookOpen,
	CircleNotch,
	FileMagnifyingGlass,
	Headphones,
	LinkBreak,
	LinkSimple,
	Sparkle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useAbilities } from "@/hooks/use-abilities";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	COVER_EDGE,
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
} from "@/utils/covers";
import {
	formatDate,
	formatNames,
	formatReadingTime,
	getErrorMessage,
} from "@/utils/format";
import { client, orpc } from "@/utils/orpc";
import { resolveReadListenAlignment } from "./read-listen-alignment";

type ReadListenMediaType = "ebook" | "audiobook";
type ReadListenPairing = Awaited<
	ReturnType<typeof client.readListen.getPairings>
>["pairings"][number];
type PairingCandidate = Awaited<
	ReturnType<typeof client.readListen.searchCandidates>
>["candidates"][number];
type ReadListenPublication =
	| ReadListenPairing["ebook"]
	| ReadListenPairing["audiobook"]
	| PairingCandidate;

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_LIMIT = 8;

function getCounterpartPublication(
	pairing: ReadListenPairing,
	mediaType: ReadListenMediaType,
) {
	return mediaType === "ebook" ? pairing.audiobook : pairing.ebook;
}

function getPublicationRoute(mediaType: ReadListenMediaType) {
	return mediaType === "audiobook"
		? "/dashboard/audiobooks/$uuid"
		: "/dashboard/books/$uuid";
}

function PublicationCover({
	publication,
}: {
	publication: ReadListenPublication;
}) {
	const coverFilename = getCoverFilename(publication.cover);
	const isAudiobook = publication.mediaType === "audiobook";
	const frameClass = isAudiobook ? "size-16" : "h-16 w-12";

	if (coverFilename) {
		return (
			<img
				src={getCoverPresetUrl(coverFilename, coverPresets.thumbnail)}
				alt=""
				className={cn(
					frameClass,
					COVER_EDGE,
					"shrink-0 rounded-md object-cover",
				)}
			/>
		);
	}

	const Icon = isAudiobook ? Headphones : BookOpen;
	return (
		<div
			className={cn(
				frameClass,
				"flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
			)}
		>
			<Icon aria-hidden="true" className="size-5" />
		</div>
	);
}

function PublicationSummary({
	publication,
}: {
	publication: ReadListenPublication;
}) {
	const creators = formatNames(publication.authors);
	const narrators = formatNames(publication.narrators);

	return (
		<div className="flex min-w-0 items-start gap-3">
			<PublicationCover publication={publication} />
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<p className="break-words font-medium text-sm leading-snug">
					{publication.title}
				</p>
				{creators && (
					<p className="truncate text-muted-foreground text-xs">{creators}</p>
				)}
				{narrators && (
					<p className="truncate text-muted-foreground text-xs">
						{m["audiobook.narrated_by"]()} {narrators}
					</p>
				)}
				<div className="flex flex-wrap gap-x-2 gap-y-1 text-muted-foreground text-xs">
					{publication.libraryName && (
						<span>
							{m["read_listen.library"]({
								name: publication.libraryName,
							})}
						</span>
					)}
					{publication.languageCode && (
						<span className="uppercase">{publication.languageCode}</span>
					)}
					{publication.duration && (
						<span>{formatReadingTime(publication.duration)}</span>
					)}
					{publication.abridged && (
						<Badge variant="secondary">{m["read_listen.abridged"]()}</Badge>
					)}
				</div>
				<p className="truncate text-muted-foreground/80 text-xs">
					{publication.filename}
				</p>
			</div>
		</div>
	);
}

function PairingDialog({
	onOpenChange,
	publicationUuid,
	publicationTitle,
	mediaType,
}: {
	onOpenChange: (open: boolean) => void;
	publicationUuid: string;
	publicationTitle: string;
	mediaType: ReadListenMediaType;
}) {
	const queryClient = useQueryClient();
	const inputId = useId();
	const statusId = useId();
	const [query, setQuery] = useState(publicationTitle);
	const [selectedCandidate, setSelectedCandidate] =
		useState<PairingCandidate | null>(null);
	const debouncedQuery = useDebounce(query.trim(), SEARCH_DEBOUNCE_MS);

	const candidatesQuery = useQuery({
		...orpc.readListen.searchCandidates.queryOptions({
			input: {
				publicationUuid,
				query: debouncedQuery || publicationTitle,
				limit: SEARCH_LIMIT,
			},
		}),
		enabled: !selectedCandidate && debouncedQuery.length > 0,
		staleTime: 30_000,
	});
	const candidates = candidatesQuery.data?.candidates ?? [];
	const currentPublication = candidatesQuery.data?.publication;
	const searchStatus =
		debouncedQuery.length === 0
			? m["read_listen.type_to_search"]()
			: candidatesQuery.isFetching
				? m["read_listen.searching"]()
				: candidates.length > 0
					? m["read_listen.results_count"]({ count: candidates.length })
					: m["read_listen.no_matches"]();

	const associateMutation = useMutation({
		mutationFn: (candidateUuid: string) =>
			client.readListen.associate({ publicationUuid, candidateUuid }),
		onSuccess: async () => {
			toast.success(m["read_listen.associated"]());
			onOpenChange(false);
			await queryClient.invalidateQueries({ queryKey: orpc.readListen.key() });
		},
		onError: (error) =>
			toast.error(getErrorMessage(error, m["read_listen.associate_failed"]())),
	});

	const closeDialog = () => {
		if (!associateMutation.isPending) onOpenChange(false);
	};

	return (
		<Modal
			open
			onOpenChange={(nextOpen) => {
				if (!nextOpen) closeDialog();
			}}
			title={
				selectedCandidate
					? m["read_listen.confirm_title"]()
					: mediaType === "ebook"
						? m["read_listen.dialog_audiobook_title"]()
						: m["read_listen.dialog_ebook_title"]()
			}
			description={
				selectedCandidate
					? m["read_listen.confirm_description"]()
					: m["read_listen.dialog_description"]()
			}
			className="sm:max-w-xl"
			footer={
				selectedCandidate ? (
					<>
						<Button
							type="button"
							variant="outline"
							disabled={associateMutation.isPending}
							onClick={() => setSelectedCandidate(null)}
						>
							{m["read_listen.back_to_results"]()}
						</Button>
						<Button
							type="button"
							disabled={associateMutation.isPending}
							aria-busy={associateMutation.isPending}
							onClick={() => associateMutation.mutate(selectedCandidate.uuid)}
						>
							{associateMutation.isPending ? (
								<CircleNotch
									aria-hidden="true"
									data-icon="inline-start"
									className="animate-spin motion-reduce:animate-none"
								/>
							) : (
								<LinkSimple aria-hidden="true" data-icon="inline-start" />
							)}
							{m["read_listen.associate"]()}
						</Button>
					</>
				) : undefined
			}
		>
			{selectedCandidate ? (
				<div className="flex flex-col gap-3 rounded-2xl bg-muted/45 p-4">
					{currentPublication && (
						<PublicationSummary publication={currentPublication} />
					)}
					<PublicationSummary publication={selectedCandidate} />
				</div>
			) : (
				<div className="flex flex-col gap-4">
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={inputId}>
								{mediaType === "ebook"
									? m["read_listen.search_audiobook_label"]()
									: m["read_listen.search_ebook_label"]()}
							</FieldLabel>
							<Input
								id={inputId}
								name="read-listen-search"
								type="search"
								autoComplete="off"
								autoFocus
								aria-describedby={statusId}
								placeholder={m["read_listen.search_placeholder"]()}
								value={query}
								onChange={(event) => setQuery(event.target.value)}
							/>
						</Field>
					</FieldGroup>

					<div className="max-h-80 overflow-y-auto overscroll-contain">
						<p
							id={statusId}
							role="status"
							className={cn(
								candidates.length > 0
									? "sr-only"
									: "py-8 text-center text-muted-foreground text-sm",
							)}
						>
							{searchStatus}
						</p>
						{candidates.length > 0 && (
							<ul
								className="flex flex-col gap-2"
								aria-busy={candidatesQuery.isFetching}
							>
								{candidates.map((candidate) => (
									<li key={candidate.uuid}>
										<button
											type="button"
											disabled={candidate.isPaired}
											onClick={() => setSelectedCandidate(candidate)}
											className="flex min-h-20 w-full items-start gap-3 rounded-2xl bg-muted/45 p-3 text-start transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-65"
										>
											<div className="min-w-0 flex-1">
												<PublicationSummary publication={candidate} />
											</div>
											{candidate.isPaired && (
												<Badge variant="secondary">
													{m["read_listen.already_paired"]()}
												</Badge>
											)}
										</button>
									</li>
								))}
							</ul>
						)}
					</div>
				</div>
			)}
		</Modal>
	);
}

export function ReadListenSection({
	publicationUuid,
	publicationTitle,
	mediaType,
}: {
	publicationUuid: string;
	publicationTitle: string;
	mediaType: ReadListenMediaType;
}) {
	const queryClient = useQueryClient();
	const { can } = useAbilities();
	const headingId = useId();
	const canManagePairings = can("book", "editMetadata");
	const [isPairingDialogOpen, setIsPairingDialogOpen] = useState(false);
	const [pairingToRemove, setPairingToRemove] =
		useState<ReadListenPairing | null>(null);
	const pairingsQuery = useQuery(
		orpc.readListen.getPairings.queryOptions({ input: { publicationUuid } }),
	);
	const pairings = pairingsQuery.data?.pairings ?? [];

	const removeMutation = useMutation({
		mutationFn: (pairUuid: string) => client.readListen.remove({ pairUuid }),
		onSuccess: async () => {
			toast.success(m["read_listen.removed"]());
			setPairingToRemove(null);
			await queryClient.invalidateQueries({ queryKey: orpc.readListen.key() });
		},
		onError: (error) =>
			toast.error(getErrorMessage(error, m["read_listen.remove_failed"]())),
	});
	const importAlignmentMutation = useMutation({
		mutationFn: (pairUuid: string) =>
			client.readListen.importExistingAlignment({ pairUuid }),
		onSuccess: async (result) => {
			switch (result.outcome) {
				case "imported":
					toast.success(m["read_listen.alignment_imported"]());
					break;
				case "not_found":
					toast(m["read_listen.alignment_not_found"]());
					break;
				case "invalid":
					toast.error(m["read_listen.alignment_invalid"]());
					break;
				case "source_mismatch":
					toast.error(m["read_listen.alignment_source_mismatch"]());
					break;
			}
			await queryClient.invalidateQueries({ queryKey: orpc.readListen.key() });
		},
		onError: (error) =>
			toast.error(
				getErrorMessage(error, m["read_listen.alignment_detection_failed"]()),
			),
	});
	const generateAlignmentMutation = useMutation({
		mutationFn: (pairUuid: string) =>
			client.readListen.generateAlignment({ pairUuid }),
		onSuccess: async (result) => {
			toast(
				result.reused
					? m["read_listen.generation_already_running"]()
					: m["read_listen.generation_started"](),
			);
			await queryClient.invalidateQueries({ queryKey: orpc.readListen.key() });
		},
		onError: (error) =>
			toast.error(
				getErrorMessage(error, m["read_listen.generation_start_failed"]()),
			),
	});

	if (pairingsQuery.isLoading) {
		return (
			<section className="mt-8 flex flex-col gap-4" aria-labelledby={headingId}>
				<h2 id={headingId} className="font-bold text-xl">
					{m["read_listen.title"]()}
				</h2>
				<Skeleton className="h-24 w-full rounded-2xl" />
			</section>
		);
	}

	if (pairings.length === 0 && !canManagePairings) return null;

	return (
		<section className="mt-8 flex flex-col gap-4" aria-labelledby={headingId}>
			<div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex min-w-0 flex-col gap-1">
					<h2 id={headingId} className="font-bold text-xl">
						{m["read_listen.title"]()}
					</h2>
					<p className="text-muted-foreground text-sm">
						{mediaType === "ebook"
							? m["read_listen.ebook_description"]()
							: m["read_listen.audiobook_description"]()}
					</p>
				</div>
				{canManagePairings && (
					<Button
						variant="outline"
						onClick={() => setIsPairingDialogOpen(true)}
					>
						<LinkSimple aria-hidden="true" data-icon="inline-start" />
						{mediaType === "ebook"
							? m["read_listen.associate_audiobook"]()
							: m["read_listen.associate_ebook"]()}
					</Button>
				)}
			</div>

			{pairings.length > 0 && (
				<ul className="flex flex-col gap-3">
					{pairings.map((pairing) => {
						const counterpart = getCounterpartPublication(pairing, mediaType);
						const alignment = resolveReadListenAlignment(pairing.alignment);
						const isCheckingAlignment =
							importAlignmentMutation.isPending &&
							importAlignmentMutation.variables === pairing.id;
						const isGenerationRunning =
							pairing.generation?.status === "queued" ||
							pairing.generation?.status === "running";
						const isStartingGeneration =
							generateAlignmentMutation.isPending &&
							generateAlignmentMutation.variables === pairing.id;
						const alignmentDescription = isGenerationRunning
							? m["read_listen.generating_alignment"]()
							: pairing.generation?.status === "failed"
								? m["read_listen.generation_failed"]()
								: alignment.status === "ready"
									? m["read_listen.alignment_ready_description"]({
											count: alignment.artifact.cueCount,
											version: alignment.artifact.generatorVersion,
											date: formatDate(alignment.artifact.generatedAt),
										})
									: alignment.status === "stale"
										? m["read_listen.alignment_stale_description"]()
										: m["read_listen.alignment_not_imported_description"]();
						return (
							<li
								key={pairing.id}
								className="flex flex-col gap-4 rounded-2xl bg-muted/45 p-4 sm:flex-row sm:items-center"
							>
								<Link
									to={getPublicationRoute(counterpart.mediaType)}
									params={{ uuid: counterpart.uuid }}
									className="min-w-0 flex-1 rounded-lg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
								>
									<PublicationSummary publication={counterpart} />
								</Link>
								<div className="flex shrink-0 flex-col items-start gap-2 sm:max-w-xs sm:items-end">
									<div className="flex flex-wrap items-center gap-2 sm:justify-end">
										<Badge
											variant={
												alignment.status === "ready"
													? "success"
													: alignment.status === "stale"
														? "warning"
														: "secondary"
											}
										>
											{alignment.status === "ready"
												? m["read_listen.status_ready"]()
												: alignment.status === "stale"
													? m["read_listen.status_stale"]()
													: m["read_listen.status_not_imported"]()}
										</Badge>
										{canManagePairings && alignment.status !== "ready" && (
											<Button
												size="sm"
												disabled={
													isGenerationRunning ||
													generateAlignmentMutation.isPending
												}
												aria-busy={isGenerationRunning || isStartingGeneration}
												onClick={() =>
													generateAlignmentMutation.mutate(pairing.id)
												}
											>
												{isGenerationRunning || isStartingGeneration ? (
													<CircleNotch
														aria-hidden="true"
														data-icon="inline-start"
														className="animate-spin motion-reduce:animate-none"
													/>
												) : (
													<Sparkle
														aria-hidden="true"
														data-icon="inline-start"
													/>
												)}
												{isGenerationRunning || isStartingGeneration
													? m["read_listen.generating_alignment"]()
													: alignment.status === "stale"
														? m["read_listen.regenerate_alignment"]()
														: m["read_listen.generate_alignment"]()}
											</Button>
										)}
										{canManagePairings && alignment.status !== "ready" && (
											<Button
												variant="outline"
												size="sm"
												disabled={
													importAlignmentMutation.isPending ||
													isGenerationRunning
												}
												aria-busy={isCheckingAlignment}
												onClick={() =>
													importAlignmentMutation.mutate(pairing.id)
												}
											>
												{isCheckingAlignment ? (
													<CircleNotch
														aria-hidden="true"
														data-icon="inline-start"
														className="animate-spin motion-reduce:animate-none"
													/>
												) : (
													<FileMagnifyingGlass
														aria-hidden="true"
														data-icon="inline-start"
													/>
												)}
												{isCheckingAlignment
													? m["read_listen.detecting_alignment"]()
													: alignment.status === "stale"
														? m["read_listen.find_updated_alignment"]()
														: m["read_listen.find_existing_alignment"]()}
											</Button>
										)}
										{canManagePairings && (
											<Button
												variant="ghost"
												size="icon-lg"
												aria-label={m["read_listen.remove_named"]({
													title: counterpart.title,
												})}
												onClick={() => setPairingToRemove(pairing)}
											>
												<LinkBreak aria-hidden="true" />
											</Button>
										)}
									</div>
									<p className="text-muted-foreground text-xs sm:text-end">
										{alignmentDescription}
									</p>
								</div>
							</li>
						);
					})}
				</ul>
			)}

			{isPairingDialogOpen && (
				<PairingDialog
					onOpenChange={setIsPairingDialogOpen}
					publicationUuid={publicationUuid}
					publicationTitle={publicationTitle}
					mediaType={mediaType}
				/>
			)}

			<Modal
				open={pairingToRemove !== null}
				onOpenChange={(open) => {
					if (!open && !removeMutation.isPending) setPairingToRemove(null);
				}}
				title={m["read_listen.remove_title"]()}
				description={m["read_listen.remove_description"]()}
				footer={
					<>
						<Button
							type="button"
							variant="outline"
							disabled={removeMutation.isPending}
							onClick={() => setPairingToRemove(null)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={removeMutation.isPending || !pairingToRemove}
							aria-busy={removeMutation.isPending}
							onClick={() => {
								if (pairingToRemove) removeMutation.mutate(pairingToRemove.id);
							}}
						>
							{removeMutation.isPending ? (
								<CircleNotch
									aria-hidden="true"
									data-icon="inline-start"
									className="animate-spin motion-reduce:animate-none"
								/>
							) : (
								<LinkBreak aria-hidden="true" data-icon="inline-start" />
							)}
							{m["read_listen.remove"]()}
						</Button>
					</>
				}
			>
				{pairingToRemove && (
					<div className="rounded-2xl bg-muted/45 p-4">
						<PublicationSummary
							publication={getCounterpartPublication(
								pairingToRemove,
								mediaType,
							)}
						/>
					</div>
				)}
			</Modal>
		</section>
	);
}
