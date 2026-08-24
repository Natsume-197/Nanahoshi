import { env } from "@nanahoshi-v2/env/web";
import {
	BookOpen,
	ChartBar,
	CircleNotch,
	FileArrowUp,
	FileMagnifyingGlass,
	FileText,
	Headphones,
	LinkBreak,
	LinkSimple,
	Sparkle,
	UploadSimple,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ChangeEvent, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
type AlignmentImportResult = Awaited<
	ReturnType<typeof client.readListen.importExistingAlignment>
>;
type AlignmentGenerationResult = Awaited<
	ReturnType<typeof client.readListen.generateAlignment>
>;
type ReadListenPublication =
	| ReadListenPairing["ebook"]
	| ReadListenPairing["audiobook"]
	| PairingCandidate;

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_LIMIT = 8;

async function postAlignmentInput<T>(
	pairUuid: string,
	formData: FormData,
): Promise<T> {
	const response = await fetch(
		`${env.VITE_SERVER_URL}/api/read-listen/${pairUuid}/alignment-input`,
		{ method: "POST", body: formData, credentials: "include" },
	);
	const result = (await response.json().catch(() => null)) as
		| (T & { message?: string })
		| null;
	if (!response.ok || !result) {
		throw new Error(
			result?.message ?? m["read_listen.alignment_input_upload_failed"](),
		);
	}
	return result;
}

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

function AlignmentInputDialog({
	pairing,
	pending,
	onImportDetected,
	onUploadAlignment,
	onGenerate,
	onUploadTimedText,
	onOpenChange,
}: {
	pairing: ReadListenPairing;
	pending: boolean;
	onImportDetected: (pairUuid: string) => void;
	onUploadAlignment: (input: {
		pairUuid: string;
		alignment: File;
		report?: File;
	}) => void;
	onGenerate: (input: {
		pairUuid: string;
		mode: "provider" | "timed-text";
		timedTextFilenames?: string[];
		verifyTimedText?: boolean;
	}) => void;
	onUploadTimedText: (input: {
		pairUuid: string;
		files: File[];
		verifyTimedText: boolean;
	}) => void;
	onOpenChange: (open: boolean) => void;
}) {
	const validationId = useId();
	const [mode, setMode] = useState<"alignment" | "timed-text" | "provider">(
		"alignment",
	);
	const [alignmentSource, setAlignmentSource] = useState<"detected" | "upload">(
		"detected",
	);
	const [timedTextSource, setTimedTextSource] = useState<"detected" | "upload">(
		"detected",
	);
	const [alignmentFile, setAlignmentFile] = useState<File | null>(null);
	const [reportFile, setReportFile] = useState<File | null>(null);
	const [uploadedSrt, setUploadedSrt] = useState<Array<File | null>>([]);
	const [verifyTimedText, setVerifyTimedText] = useState(false);
	const [selections, setSelections] = useState<string[]>([]);
	const [validationError, setValidationError] = useState<string | null>(null);
	const candidatesQuery = useQuery({
		...orpc.readListen.getTimedTextCandidates.queryOptions({
			input: { pairUuid: pairing.id },
		}),
		enabled: mode === "timed-text",
		staleTime: 30_000,
	});
	const tracks = candidatesQuery.data?.tracks;
	useEffect(() => {
		if (!tracks) return;
		setSelections(
			tracks.map((track) =>
				track.candidates.length === 1 ? (track.candidates[0] ?? "") : "",
			),
		);
		setUploadedSrt((current) =>
			tracks.map((_, index) => current[index] ?? null),
		);
	}, [tracks]);
	const availableTracks = tracks ?? [];
	const timedTextReady =
		availableTracks.length > 0 &&
		availableTracks.every(
			(track, index) =>
				Boolean(selections[index]) &&
				track.candidates.includes(selections[index] ?? ""),
		);
	const uploadedTimedTextReady =
		availableTracks.length > 0 &&
		uploadedSrt.length === availableTracks.length &&
		uploadedSrt.every(Boolean);
	const submitLabel =
		mode === "alignment"
			? m["read_listen.import_alignment"]()
			: m["read_listen.create_alignment"]();

	const submit = () => {
		setValidationError(null);
		if (mode === "alignment") {
			if (alignmentSource === "detected") {
				onImportDetected(pairing.id);
			} else if (alignmentFile) {
				onUploadAlignment({
					pairUuid: pairing.id,
					alignment: alignmentFile,
					...(reportFile ? { report: reportFile } : {}),
				});
			} else {
				setValidationError(m["read_listen.choose_alignment_required"]());
				requestAnimationFrame(() =>
					document.getElementById(`alignment-upload-${pairing.id}`)?.focus(),
				);
			}
			return;
		}
		if (mode === "provider") {
			onGenerate({ pairUuid: pairing.id, mode: "provider" });
			return;
		}
		if (timedTextSource === "upload") {
			if (!uploadedTimedTextReady) {
				setValidationError(m["read_listen.choose_srt_required"]());
				const missingIndex = uploadedSrt.findIndex((file) => !file);
				requestAnimationFrame(() =>
					document
						.getElementById(
							`srt-upload-${pairing.id}-${availableTracks[missingIndex]?.audioFileIndex ?? 0}`,
						)
						?.focus(),
				);
				return;
			}
			onUploadTimedText({
				pairUuid: pairing.id,
				files: uploadedSrt.filter((file): file is File => Boolean(file)),
				verifyTimedText,
			});
			return;
		}
		if (!timedTextReady) {
			setValidationError(m["read_listen.choose_srt_required"]());
			const missingIndex = selections.findIndex((selection) => !selection);
			requestAnimationFrame(() =>
				document
					.getElementById(
						`timed-text-${pairing.id}-${availableTracks[missingIndex]?.audioFileIndex ?? 0}`,
					)
					?.focus(),
			);
			return;
		}
		onGenerate({
			pairUuid: pairing.id,
			mode: "timed-text",
			timedTextFilenames: selections,
			verifyTimedText,
		});
	};

	return (
		<Modal
			open
			onOpenChange={(open) => {
				if (!open && !pending) onOpenChange(false);
			}}
			title={m["read_listen.add_alignment_title"]()}
			description={m["read_listen.add_alignment_description"]()}
			className="sm:max-w-2xl"
			footer={
				<>
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={() => onOpenChange(false)}
					>
						{m["common.cancel"]()}
					</Button>
					<Button
						type="button"
						disabled={pending}
						aria-busy={pending}
						onClick={submit}
					>
						{pending ? (
							<CircleNotch
								aria-hidden="true"
								data-icon="inline-start"
								className="animate-spin motion-reduce:animate-none"
							/>
						) : (
							<Sparkle aria-hidden="true" data-icon="inline-start" />
						)}
						{submitLabel}
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<div className="grid gap-2 sm:grid-cols-3">
					<button
						type="button"
						aria-pressed={mode === "alignment"}
						onClick={() => {
							setMode("alignment");
							setValidationError(null);
						}}
						className={cn(
							"rounded-2xl border p-4 text-start transition-colors",
							mode === "alignment"
								? "border-primary bg-primary/5"
								: "border-border hover:bg-muted/60",
						)}
					>
						<FileArrowUp aria-hidden="true" className="mb-2 size-5" />
						<span className="block font-medium text-sm">
							{m["read_listen.input_mode_alignment"]()}
						</span>
						<span className="mt-1 block text-muted-foreground text-xs">
							{m["read_listen.input_mode_alignment_description"]()}
						</span>
					</button>
					<button
						type="button"
						aria-pressed={mode === "provider"}
						onClick={() => {
							setMode("provider");
							setValidationError(null);
						}}
						className={cn(
							"rounded-2xl border p-4 text-start transition-colors",
							mode === "provider"
								? "border-primary bg-primary/5"
								: "border-border hover:bg-muted/60",
						)}
					>
						<Sparkle aria-hidden="true" className="mb-2 size-5" />
						<span className="block font-medium text-sm">
							{m["read_listen.generation_mode_provider"]()}
						</span>
						<span className="mt-1 block text-muted-foreground text-xs">
							{m["read_listen.generation_mode_provider_description"]()}
						</span>
					</button>
					<button
						type="button"
						aria-pressed={mode === "timed-text"}
						onClick={() => {
							setMode("timed-text");
							setValidationError(null);
						}}
						className={cn(
							"rounded-2xl border p-4 text-start transition-colors",
							mode === "timed-text"
								? "border-primary bg-primary/5"
								: "border-border hover:bg-muted/60",
						)}
					>
						<FileText aria-hidden="true" className="mb-2 size-5" />
						<span className="block font-medium text-sm">
							{m["read_listen.generation_mode_srt"]()}
						</span>
						<span className="mt-1 block text-muted-foreground text-xs">
							{m["read_listen.generation_mode_srt_description"]()}
						</span>
					</button>
				</div>

				{mode === "alignment" && (
					<div className="flex flex-col gap-3">
						<SourceChoice
							label={m["read_listen.source_choice_label"]()}
							value={alignmentSource}
							onChange={(value) => {
								setAlignmentSource(value);
								setValidationError(null);
							}}
							detectedLabel={m["read_listen.detect_nearby_alignment"]()}
							uploadLabel={m["read_listen.upload_alignment_file"]()}
						/>
						{alignmentSource === "detected" ? (
							<p className="rounded-xl bg-muted/60 p-3 text-muted-foreground text-sm">
								{m["read_listen.detect_nearby_alignment_description"]()}
							</p>
						) : (
							<div className="grid gap-3 sm:grid-cols-2">
								<FileField
									id={`alignment-upload-${pairing.id}`}
									label={m["read_listen.alignment_file_label"]()}
									accept=".json,application/json"
									disabled={pending}
									invalid={Boolean(validationError && !alignmentFile)}
									describedBy={validationError ? validationId : undefined}
									onChange={setAlignmentFile}
								/>
								<FileField
									id={`alignment-report-upload-${pairing.id}`}
									label={m["read_listen.alignment_report_label"]()}
									accept=".json,application/json"
									disabled={pending}
									onChange={setReportFile}
								/>
							</div>
						)}
					</div>
				)}

				{mode === "timed-text" && (
					<div
						className="flex flex-col gap-3"
						aria-busy={candidatesQuery.isFetching}
					>
						<SourceChoice
							label={m["read_listen.source_choice_label"]()}
							value={timedTextSource}
							onChange={(value) => {
								setTimedTextSource(value);
								setValidationError(null);
							}}
							detectedLabel={m["read_listen.use_detected_srt"]()}
							uploadLabel={m["read_listen.upload_srt_files"]()}
						/>
						{candidatesQuery.isFetching ? (
							<p role="status" className="text-muted-foreground text-sm">
								{m["read_listen.loading_srt_candidates"]()}
							</p>
						) : candidatesQuery.isError || availableTracks.length === 0 ? (
							<p className="rounded-xl bg-muted/60 p-3 text-muted-foreground text-sm">
								{m["read_listen.audio_tracks_unavailable"]()}
							</p>
						) : timedTextSource === "upload" ? (
							availableTracks.map((track, index) => (
								<FileField
									key={track.audioFileIndex}
									id={`srt-upload-${pairing.id}-${track.audioFileIndex}`}
									label={track.audioFilename}
									accept=".srt,application/x-subrip,text/plain"
									disabled={pending}
									invalid={Boolean(validationError && !uploadedSrt[index])}
									describedBy={validationError ? validationId : undefined}
									onChange={(file) =>
										setUploadedSrt((current) => {
											const next = [...current];
											next[index] = file;
											return next;
										})
									}
								/>
							))
						) : availableTracks.some(
								(track) => track.candidates.length === 0,
							) ? (
							<p className="rounded-xl bg-muted/60 p-3 text-muted-foreground text-sm">
								{m["read_listen.no_srt_candidates"]()}
							</p>
						) : (
							availableTracks.map((track, index) => (
								<Field key={track.audioFileIndex}>
									<FieldLabel
										htmlFor={`timed-text-${pairing.id}-${track.audioFileIndex}`}
									>
										{track.audioFilename}
									</FieldLabel>
									<select
										id={`timed-text-${pairing.id}-${track.audioFileIndex}`}
										value={selections[index] ?? ""}
										disabled={pending}
										aria-invalid={
											Boolean(validationError && !selections[index]) ||
											undefined
										}
										aria-describedby={
											validationError ? validationId : undefined
										}
										onChange={(event) =>
											setSelections((current) => {
												const next = [...current];
												next[index] = event.target.value;
												return next;
											})
										}
										className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
									>
										<option value="">{m["read_listen.select_srt"]()}</option>
										{track.candidates.map((candidate) => (
											<option key={candidate} value={candidate}>
												{candidate}
											</option>
										))}
									</select>
								</Field>
							))
						)}
						<div className="flex items-start justify-between gap-4 rounded-xl border p-3">
							<div className="min-w-0">
								<label
									htmlFor={`verify-timed-text-${pairing.id}`}
									className="font-medium text-sm"
								>
									{m["read_listen.verify_srt_with_honomiya"]()}
								</label>
								<p
									id={`verify-timed-text-description-${pairing.id}`}
									className="mt-1 text-muted-foreground text-xs"
								>
									{m["read_listen.verify_srt_with_honomiya_description"]()}
								</p>
							</div>
							<Switch
								id={`verify-timed-text-${pairing.id}`}
								checked={verifyTimedText}
								disabled={pending}
								aria-describedby={`verify-timed-text-description-${pairing.id}`}
								onCheckedChange={setVerifyTimedText}
							/>
						</div>
					</div>
				)}

				{mode === "provider" && (
					<p className="rounded-xl bg-muted/60 p-3 text-muted-foreground text-sm">
						{m["read_listen.provider_disclosure"]()}
					</p>
				)}
				{validationError && (
					<p
						id={validationId}
						role="alert"
						className="rounded-xl bg-destructive/10 p-3 text-sm"
					>
						{validationError}
					</p>
				)}
			</div>
		</Modal>
	);
}

function SourceChoice({
	label,
	value,
	onChange,
	detectedLabel,
	uploadLabel,
}: {
	label: string;
	value: "detected" | "upload";
	onChange: (value: "detected" | "upload") => void;
	detectedLabel: string;
	uploadLabel: string;
}) {
	return (
		<fieldset
			className="grid grid-cols-2 gap-2 border-0 p-0"
			aria-label={label}
		>
			<Button
				type="button"
				variant={value === "detected" ? "secondary" : "outline"}
				aria-pressed={value === "detected"}
				onClick={() => onChange("detected")}
			>
				<FileMagnifyingGlass aria-hidden="true" data-icon="inline-start" />
				{detectedLabel}
			</Button>
			<Button
				type="button"
				variant={value === "upload" ? "secondary" : "outline"}
				aria-pressed={value === "upload"}
				onClick={() => onChange("upload")}
			>
				<UploadSimple aria-hidden="true" data-icon="inline-start" />
				{uploadLabel}
			</Button>
		</fieldset>
	);
}

function FileField({
	id,
	label,
	accept,
	disabled,
	invalid = false,
	describedBy,
	onChange,
}: {
	id: string;
	label: string;
	accept: string;
	disabled: boolean;
	invalid?: boolean;
	describedBy?: string;
	onChange: (file: File | null) => void;
}) {
	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<input
				id={id}
				type="file"
				accept={accept}
				disabled={disabled}
				aria-invalid={invalid || undefined}
				aria-describedby={describedBy}
				onChange={(event: ChangeEvent<HTMLInputElement>) =>
					onChange(event.target.files?.[0] ?? null)
				}
				className="block min-h-10 w-full cursor-pointer rounded-md border border-input bg-transparent text-sm file:me-3 file:min-h-10 file:border-0 file:border-border file:border-e file:bg-muted file:px-3 file:text-foreground file:text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
			/>
		</Field>
	);
}

function AlignmentDiagnosticsDialog({
	pairing,
	onOpenChange,
}: {
	pairing: ReadListenPairing;
	onOpenChange: (open: boolean) => void;
}) {
	const diagnosticsQuery = useQuery(
		orpc.readListen.getAlignmentDiagnostics.queryOptions({
			input: { pairUuid: pairing.id },
		}),
	);
	const report = diagnosticsQuery.data?.report;
	const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

	return (
		<Modal
			open
			onOpenChange={onOpenChange}
			title={m["read_listen.alignment_diagnostics_title"]()}
			description={m["read_listen.alignment_diagnostics_description"]()}
			className="sm:max-w-xl"
		>
			{diagnosticsQuery.isLoading ? (
				<div className="grid gap-3 sm:grid-cols-3" aria-busy="true">
					<Skeleton className="h-20 rounded-xl" />
					<Skeleton className="h-20 rounded-xl" />
					<Skeleton className="h-20 rounded-xl" />
				</div>
			) : diagnosticsQuery.isError ? (
				<p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm">
					{m["read_listen.alignment_diagnostics_failed"]()}
				</p>
			) : !report ? (
				<p className="rounded-xl bg-muted/60 p-3 text-muted-foreground text-sm">
					{m["read_listen.alignment_diagnostics_unavailable"]()}
				</p>
			) : (
				<div className="flex flex-col gap-4">
					<div className="grid gap-3 sm:grid-cols-3">
						<div className="rounded-xl bg-muted/60 p-3">
							<p className="text-muted-foreground text-xs">
								{m["read_listen.direct_coverage"]()}
							</p>
							<p className="mt-1 font-semibold text-xl tabular-nums">
								{percent(report.alignment.directCoverage)}
							</p>
						</div>
						<div className="rounded-xl bg-muted/60 p-3">
							<p className="text-muted-foreground text-xs">
								{m["read_listen.aligned_sentences"]()}
							</p>
							<p className="mt-1 font-semibold text-xl tabular-nums">
								{report.alignment.directCues +
									report.alignment.interpolatedCues}
								/{report.alignment.bookSentences}
							</p>
						</div>
						<div className="rounded-xl bg-muted/60 p-3">
							<p className="text-muted-foreground text-xs">
								{m["read_listen.unmatched_sentences"]()}
							</p>
							<p className="mt-1 font-semibold text-xl tabular-nums">
								{report.alignment.unmatchedSentences}
							</p>
						</div>
					</div>
					{report.transcription.timedText?.map((source) => (
						<div key={source.filename} className="rounded-xl border p-3">
							<p className="break-words font-medium text-sm">
								{source.filename}
							</p>
							<p className="mt-1 text-muted-foreground text-xs">
								{m["read_listen.srt_cue_summary"]({
									used: source.usedCues,
									excluded: source.excludedCues,
								})}
							</p>
							{source.verification && (
								<p className="mt-2 text-sm">
									{m["read_listen.acoustic_verification_summary"]({
										confidence: source.verification.confidence,
										score: percent(source.verification.averageScore),
										passing: source.verification.passingSamples,
										total: source.verification.totalSamples,
									})}
								</p>
							)}
						</div>
					))}
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
	const [pairingToAddAlignment, setPairingToAddAlignment] =
		useState<ReadListenPairing | null>(null);
	const [pairingForDiagnostics, setPairingForDiagnostics] =
		useState<ReadListenPairing | null>(null);
	const pairingsQuery = useQuery(
		orpc.readListen.getPairings.queryOptions({ input: { publicationUuid } }),
	);
	const pairings = pairingsQuery.data?.pairings ?? [];
	const notifyImportResult = (result: AlignmentImportResult) => {
		switch (result.outcome) {
			case "imported":
				toast.success(m["read_listen.alignment_imported"]());
				setPairingToAddAlignment(null);
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
	};
	const notifyGenerationResult = (result: AlignmentGenerationResult) => {
		toast(
			result.reused
				? m["read_listen.generation_already_running"]()
				: m["read_listen.generation_started"](),
		);
		setPairingToAddAlignment(null);
	};

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
			notifyImportResult(result);
			await queryClient.invalidateQueries({ queryKey: orpc.readListen.key() });
		},
		onError: (error) =>
			toast.error(
				getErrorMessage(error, m["read_listen.alignment_detection_failed"]()),
			),
	});
	const generateAlignmentMutation = useMutation({
		mutationFn: (input: {
			pairUuid: string;
			mode: "provider" | "timed-text";
			timedTextFilenames?: string[];
			verifyTimedText?: boolean;
		}) => client.readListen.generateAlignment(input),
		onSuccess: async (result) => {
			notifyGenerationResult(result);
			await queryClient.invalidateQueries({ queryKey: orpc.readListen.key() });
		},
		onError: (error) =>
			toast.error(
				getErrorMessage(error, m["read_listen.generation_start_failed"]()),
			),
	});
	const uploadAlignmentInputMutation = useMutation({
		mutationFn: async (
			input:
				| {
						kind: "alignment";
						pairUuid: string;
						alignment: File;
						report?: File;
				  }
				| {
						kind: "timed-text";
						pairUuid: string;
						files: File[];
						verifyTimedText: boolean;
				  },
		) => {
			const formData = new FormData();
			formData.set("kind", input.kind);
			if (input.kind === "alignment") {
				formData.set("alignment", input.alignment);
				if (input.report) formData.set("report", input.report);
				return {
					kind: input.kind,
					result: await postAlignmentInput<AlignmentImportResult>(
						input.pairUuid,
						formData,
					),
				} as const;
			}
			formData.set("verifyTimedText", String(input.verifyTimedText));
			for (const file of input.files) formData.append("srt", file);
			return {
				kind: input.kind,
				result: await postAlignmentInput<AlignmentGenerationResult>(
					input.pairUuid,
					formData,
				),
			} as const;
		},
		onSuccess: async (output) => {
			if (output.kind === "alignment") notifyImportResult(output.result);
			else notifyGenerationResult(output.result);
			await queryClient.invalidateQueries({ queryKey: orpc.readListen.key() });
		},
		onError: (error) =>
			toast.error(
				getErrorMessage(
					error,
					m["read_listen.alignment_input_upload_failed"](),
				),
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
						const isGenerationRunning =
							pairing.generation?.status === "queued" ||
							pairing.generation?.status === "running";
						const hasFailedGeneration = pairing.generation?.status === "failed";
						const isStartingAlignmentAction =
							(importAlignmentMutation.isPending &&
								importAlignmentMutation.variables === pairing.id) ||
							(generateAlignmentMutation.isPending &&
								generateAlignmentMutation.variables?.pairUuid === pairing.id) ||
							(uploadAlignmentInputMutation.isPending &&
								uploadAlignmentInputMutation.variables?.pairUuid ===
									pairing.id);
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
										{alignment.status !== "not_imported" &&
											alignment.artifact.origin && (
												<Badge variant="secondary">
													{alignment.artifact.origin === "external"
														? m["read_listen.origin_external"]()
														: m["read_listen.origin_honomiya"]()}
												</Badge>
											)}
										{alignment.status !== "not_imported" && (
											<Button
												variant="outline"
												size="sm"
												onClick={() => setPairingForDiagnostics(pairing)}
											>
												<ChartBar aria-hidden="true" data-icon="inline-start" />
												{m["read_listen.view_diagnostics"]()}
											</Button>
										)}
										{canManagePairings && (
											<Button
												size="sm"
												disabled={
													isGenerationRunning || isStartingAlignmentAction
												}
												aria-busy={
													isGenerationRunning || isStartingAlignmentAction
												}
												onClick={() => setPairingToAddAlignment(pairing)}
											>
												{isGenerationRunning || isStartingAlignmentAction ? (
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
												{isGenerationRunning
													? m["read_listen.generating_alignment"]()
													: isStartingAlignmentAction
														? m["read_listen.processing_alignment"]()
														: hasFailedGeneration
															? m["read_listen.retry_alignment"]()
															: alignment.status === "ready"
																? m["read_listen.replace_alignment"]()
																: alignment.status === "stale"
																	? m["read_listen.add_updated_alignment"]()
																	: m["read_listen.add_alignment"]()}
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

			{pairingToAddAlignment && (
				<AlignmentInputDialog
					pairing={pairingToAddAlignment}
					pending={
						importAlignmentMutation.isPending ||
						generateAlignmentMutation.isPending ||
						uploadAlignmentInputMutation.isPending
					}
					onImportDetected={(pairUuid) =>
						importAlignmentMutation.mutate(pairUuid)
					}
					onUploadAlignment={(input) =>
						uploadAlignmentInputMutation.mutate({
							kind: "alignment",
							...input,
						})
					}
					onGenerate={(input) => generateAlignmentMutation.mutate(input)}
					onUploadTimedText={(input) =>
						uploadAlignmentInputMutation.mutate({
							kind: "timed-text",
							...input,
						})
					}
					onOpenChange={(open) => {
						if (!open) setPairingToAddAlignment(null);
					}}
				/>
			)}

			{pairingForDiagnostics && (
				<AlignmentDiagnosticsDialog
					pairing={pairingForDiagnostics}
					onOpenChange={(open) => {
						if (!open) setPairingForDiagnostics(null);
					}}
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
