import { env } from "@nanahoshi/env/web";
import {
	CircleNotch,
	FileArrowUp,
	FileMagnifyingGlass,
	FileText,
	Sparkle,
	UploadSimple,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

type AlignmentImportResult = Awaited<
	ReturnType<typeof client.readListen.importExistingAlignment>
>;
type AlignmentGenerationResult = Awaited<
	ReturnType<typeof client.readListen.generateAlignment>
>;

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

/**
 * Every way to give a pair its alignment: a sidecar already next to the files,
 * an uploaded alignment, SRT subtitles, or a Honomiya run.
 */
export function PairAlignmentDialog({
	pairUuid,
	onClose,
}: {
	pairUuid: string;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: orpc.readListen.key() });
	const notifyImportResult = (result: AlignmentImportResult) => {
		switch (result.outcome) {
			case "imported":
				toast.success(m["read_listen.alignment_imported"]());
				onClose();
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
		onClose();
	};
	const importAlignmentMutation = useMutation({
		mutationFn: (pairUuid: string) =>
			client.readListen.importExistingAlignment({ pairUuid }),
		onSuccess: async (result) => {
			notifyImportResult(result);
			await invalidate();
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
			await invalidate();
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
			await invalidate();
		},
		onError: (error) =>
			toast.error(
				getErrorMessage(
					error,
					m["read_listen.alignment_input_upload_failed"](),
				),
			),
	});
	return (
		<AlignmentInputDialog
			pairUuid={pairUuid}
			pending={
				importAlignmentMutation.isPending ||
				generateAlignmentMutation.isPending ||
				uploadAlignmentInputMutation.isPending
			}
			onImportDetected={(uuid) => importAlignmentMutation.mutate(uuid)}
			onUploadAlignment={(input) =>
				uploadAlignmentInputMutation.mutate({ kind: "alignment", ...input })
			}
			onGenerate={(input) => generateAlignmentMutation.mutate(input)}
			onUploadTimedText={(input) =>
				uploadAlignmentInputMutation.mutate({ kind: "timed-text", ...input })
			}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		/>
	);
}

function AlignmentInputDialog({
	pairUuid,
	pending,
	onImportDetected,
	onUploadAlignment,
	onGenerate,
	onUploadTimedText,
	onOpenChange,
}: {
	pairUuid: string;
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
			input: { pairUuid: pairUuid },
		}),
		enabled: mode === "timed-text",
		staleTime: 30_000,
	});
	const tracks = candidatesQuery.data?.tracks;
	const previousTracks = useRef<typeof tracks>(undefined);
	if (tracks && tracks !== previousTracks.current) {
		previousTracks.current = tracks;
		setSelections(
			tracks.map((track) =>
				track.candidates.length === 1 ? (track.candidates[0] ?? "") : "",
			),
		);
		setUploadedSrt((current) =>
			tracks.map((_, index) => current[index] ?? null),
		);
	}
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
				onImportDetected(pairUuid);
			} else if (alignmentFile) {
				onUploadAlignment({
					pairUuid: pairUuid,
					alignment: alignmentFile,
					...(reportFile ? { report: reportFile } : {}),
				});
			} else {
				setValidationError(m["read_listen.choose_alignment_required"]());
				requestAnimationFrame(() =>
					document.getElementById(`alignment-upload-${pairUuid}`)?.focus(),
				);
			}
			return;
		}
		if (mode === "provider") {
			onGenerate({ pairUuid: pairUuid, mode: "provider" });
			return;
		}
		if (timedTextSource === "upload") {
			if (!uploadedTimedTextReady) {
				setValidationError(m["read_listen.choose_srt_required"]());
				const missingIndex = uploadedSrt.findIndex((file) => !file);
				requestAnimationFrame(() =>
					document
						.getElementById(
							`srt-upload-${pairUuid}-${availableTracks[missingIndex]?.audioFileIndex ?? 0}`,
						)
						?.focus(),
				);
				return;
			}
			onUploadTimedText({
				pairUuid: pairUuid,
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
						`timed-text-${pairUuid}-${availableTracks[missingIndex]?.audioFileIndex ?? 0}`,
					)
					?.focus(),
			);
			return;
		}
		onGenerate({
			pairUuid: pairUuid,
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
									id={`alignment-upload-${pairUuid}`}
									label={m["read_listen.alignment_file_label"]()}
									accept=".json,application/json"
									disabled={pending}
									invalid={Boolean(validationError && !alignmentFile)}
									describedBy={validationError ? validationId : undefined}
									onChange={setAlignmentFile}
								/>
								<FileField
									id={`alignment-report-upload-${pairUuid}`}
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
									id={`srt-upload-${pairUuid}-${track.audioFileIndex}`}
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
										htmlFor={`timed-text-${pairUuid}-${track.audioFileIndex}`}
									>
										{track.audioFilename}
									</FieldLabel>
									<select
										id={`timed-text-${pairUuid}-${track.audioFileIndex}`}
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
									htmlFor={`verify-timed-text-${pairUuid}`}
									className="font-medium text-sm"
								>
									{m["read_listen.verify_srt_with_honomiya"]()}
								</label>
								<p
									id={`verify-timed-text-description-${pairUuid}`}
									className="mt-1 text-muted-foreground text-xs"
								>
									{m["read_listen.verify_srt_with_honomiya_description"]()}
								</p>
							</div>
							<Switch
								id={`verify-timed-text-${pairUuid}`}
								checked={verifyTimedText}
								disabled={pending}
								aria-describedby={`verify-timed-text-description-${pairUuid}`}
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

export function AlignmentDiagnosticsDialog({
	pairUuid,
	onOpenChange,
}: {
	pairUuid: string;
	onOpenChange: (open: boolean) => void;
}) {
	const diagnosticsQuery = useQuery(
		orpc.readListen.getAlignmentDiagnostics.queryOptions({
			input: { pairUuid: pairUuid },
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
