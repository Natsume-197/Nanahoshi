import {
	EBOOK_EXTENSIONS,
	MAX_UPLOAD_BYTES,
} from "@nanahoshi-v2/api/modules/scanning/supportedExtensions";
import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import { env } from "@nanahoshi-v2/env/web";
import {
	ArrowClockwise,
	CheckCircle,
	CircleNotch,
	CloudArrowUp,
	WarningCircle,
	X,
	XCircle,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { type DragEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	UploadRequestError,
	uploadWithProgress,
} from "@/lib/upload-with-progress";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatFileSize } from "@/utils/format";
import { orpc, queryClient } from "@/utils/orpc";
import {
	resolveUploadTargetLibrary,
	resolveUploadTargetPathId,
} from "./library-ui-state";
import {
	addFilesToSelection,
	applyUploadFailure,
	applyUploadResult,
	overallPercent,
	removeItem,
	retryableItems,
	sendableItems,
	summarize,
	totalBytes,
	transferStatuses,
	type UploadItem,
	type UploadResult,
} from "./upload-flow-state";

const ACCEPT_ATTR = EBOOK_EXTENSIONS.map((ext) => `.${ext}`).join(",");

/** Bytes → the KB-based formatter shared with the rest of the catalog UI. */
const formatBytes = (bytes: number) =>
	formatFileSize(Math.max(1, Math.round(bytes / 1024))) ?? "";

function reasonLabel(reason: string | undefined): string | null {
	if (!reason) return null;
	if (reason.startsWith("write_failed"))
		return m["library.upload_reason_write_failed"]();
	switch (reason) {
		case "unsupported_type":
			return m["library.upload_reason_unsupported_type"]();
		case "too_large":
			return m["library.upload_reason_too_large"]({
				limit: formatBytes(MAX_UPLOAD_BYTES),
			});
		case "batch_too_large":
			return m["library.upload_reason_batch_too_large"]();
		case "duplicate":
			return m["library.upload_reason_duplicate"]();
		case "already_exists":
			return m["library.upload_reason_already_exists"]();
		case "invalid_name":
		case "invalid_path":
			return m["library.upload_reason_invalid_name"]();
		case "request_failed":
			return m["library.upload_reason_request_failed"]();
		default:
			return m["library.upload_reason_unknown"]();
	}
}

/** Left-hand status glyph for one row, given its live transfer state. */
function ItemIcon({
	item,
	transfer,
}: {
	item: UploadItem;
	transfer: "waiting" | "uploading" | "uploaded" | undefined;
}) {
	if (transfer === "uploading")
		return (
			<CircleNotch
				aria-hidden="true"
				className="size-4 shrink-0 animate-spin text-primary"
			/>
		);
	if (transfer === "uploaded")
		return (
			<CheckCircle
				aria-hidden="true"
				weight="fill"
				className="size-4 shrink-0 text-primary"
			/>
		);
	switch (item.status) {
		case "uploaded":
			return (
				<CheckCircle
					aria-hidden="true"
					weight="fill"
					className="size-4 shrink-0 text-success"
				/>
			);
		case "skipped":
			return (
				<WarningCircle
					aria-hidden="true"
					weight="fill"
					className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
				/>
			);
		case "rejected":
		case "failed":
			return (
				<XCircle
					aria-hidden="true"
					weight="fill"
					className="size-4 shrink-0 text-destructive"
				/>
			);
		default:
			return (
				<span
					aria-hidden="true"
					className="size-4 shrink-0 rounded-full border border-border"
				/>
			);
	}
}

export function UploadBooksModal({
	libraries,
	open,
	onOpenChange,
	showLibraryPicker = libraries.length > 1,
}: {
	/** One entry from a library page, every uploadable one from the create menu. */
	libraries: LibraryComplete[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Uploading from outside a library always names its destination, even with
	 *  a single candidate — otherwise the files land somewhere unstated. A
	 *  library page pins its own library instead. */
	showLibraryPicker?: boolean;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const abortRef = useRef<(() => void) | null>(null);
	/** Ids of the batch in flight, so a rejection can still resolve its rows. */
	const sentIdsRef = useRef<string[]>([]);
	// dragenter/dragleave also fire for every child crossed; only a depth counter
	// keeps the drop state from flickering under the cursor.
	const dragDepth = useRef(0);
	const [items, setItems] = useState<UploadItem[]>([]);
	const [transfer, setTransfer] = useState<{
		ids: string[];
		bytes: number;
		fraction: number;
		phase: "uploading" | "processing";
	} | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [selectedLibraryId, setSelectedLibraryId] = useState<number | null>(
		null,
	);
	const [selectedPathId, setSelectedPathId] = useState<number | null>(null);
	const [isDragging, setIsDragging] = useState(false);

	const library = resolveUploadTargetLibrary(libraries, selectedLibraryId);
	const enabledPaths = (library?.paths ?? []).filter(
		(p) => p.isEnabled !== false,
	);
	const targetPathId = resolveUploadTargetPathId(enabledPaths, selectedPathId);

	const queued = sendableItems(items);
	const queuedBytes = totalBytes(queued);
	const summary = summarize(items);
	const retryable = retryableItems(items);

	const reset = () => {
		setItems([]);
		setErrorMessage(null);
		setTransfer(null);
	};

	const uploadMutation = useMutation({
		mutationFn: async (batch: UploadItem[]) => {
			if (!library) throw new Error(m["library.upload_no_library_title"]());
			if (!targetPathId) throw new Error(m["library.upload_choose_folder"]());
			if (batch.length === 0)
				throw new Error(m["library.upload_choose_file"]());

			const formData = new FormData();
			formData.set("libraryPathId", String(targetPathId));
			for (const item of batch) formData.append("file", item.file);

			const ids = batch.map((item) => item.id);
			sentIdsRef.current = ids;
			const bytes = totalBytes(batch);
			setTransfer({ ids, bytes, fraction: 0, phase: "uploading" });

			const { promise, abort } = uploadWithProgress({
				url: `${env.VITE_SERVER_URL}/api/libraries/${library.uuid}/upload`,
				body: formData,
				onProgress: (fraction) =>
					setTransfer((prev) => (prev ? { ...prev, fraction } : prev)),
				onTransferComplete: () =>
					setTransfer((prev) =>
						prev ? { ...prev, fraction: 1, phase: "processing" } : prev,
					),
			});
			abortRef.current = abort;

			const response = await promise;
			const body = response.body as {
				message?: string;
				uploaded?: string[];
				skipped?: { filename: string; reason: string }[];
			} | null;
			if (!response.ok) {
				const error = new Error(
					response.status === 413
						? m["library.upload_batch_too_large"]()
						: (body?.message ?? m["library.upload_failed"]()),
				);
				// A 400 still carries per-file reasons (all duplicates, for example).
				throw Object.assign(error, {
					partial: body?.skipped
						? ({ uploaded: [], skipped: body.skipped } satisfies UploadResult)
						: undefined,
				});
			}
			return {
				uploaded: body?.uploaded ?? [],
				skipped: body?.skipped ?? [],
			} satisfies UploadResult;
		},
		onMutate: () => setErrorMessage(null),
		onSettled: () => {
			abortRef.current = null;
			setTransfer(null);
		},
		onSuccess: (result) => {
			const next = applyUploadResult(items, sentIdsRef.current, result);
			setItems(next);
			setErrorMessage(null);
			queryClient.invalidateQueries({
				queryKey: orpc.books.listByLibrary.key(),
			});
			const outcome = summarize(next);
			// Nothing left to read: report it and get out of the way. Any file that
			// did not make it stays on screen with its reason instead.
			if (
				outcome.skipped === 0 &&
				outcome.failed === 0 &&
				outcome.rejected === 0
			) {
				toast.success(
					m["library.upload_success"]({ count: result.uploaded.length }),
				);
				reset();
				onOpenChange(false);
			}
		},
		onError: (error: Error & { partial?: UploadResult }) => {
			const ids = sentIdsRef.current;
			if (error instanceof UploadRequestError) {
				// A cancelled upload leaves its files queued, ready to send again.
				setErrorMessage(
					error.kind === "aborted"
						? m["library.upload_cancelled"]()
						: m["library.upload_network_failed"](),
				);
				if (error.kind === "network") {
					setItems(applyUploadFailure(items, ids, "request_failed"));
				}
				return;
			}
			setErrorMessage(error.message);
			setItems(
				error.partial
					? applyUploadResult(items, ids, error.partial)
					: applyUploadFailure(items, ids, "request_failed"),
			);
		},
	});

	const isBusy = uploadMutation.isPending;
	const transferStatus = transfer
		? transferStatuses(
				items.filter((item) => transfer.ids.includes(item.id)),
				transfer.fraction * transfer.bytes,
			)
		: null;
	const percent = transfer
		? overallPercent(transfer.fraction * transfer.bytes, transfer.bytes)
		: 0;

	const addFiles = (incoming: FileList | File[]) => {
		setErrorMessage(null);
		setItems((prev) => addFilesToSelection(prev, Array.from(incoming)));
	};

	const acceptsDrop = (event: DragEvent) =>
		!isBusy &&
		enabledPaths.length > 0 &&
		Array.from(event.dataTransfer.types).includes("Files");

	const onDragEnter = (event: DragEvent) => {
		if (!acceptsDrop(event)) return;
		event.preventDefault();
		dragDepth.current += 1;
		setIsDragging(true);
	};
	const onDragLeave = () => {
		dragDepth.current = Math.max(0, dragDepth.current - 1);
		if (dragDepth.current === 0) setIsDragging(false);
	};
	const onDrop = (event: DragEvent) => {
		event.preventDefault();
		dragDepth.current = 0;
		setIsDragging(false);
		if (isBusy || enabledPaths.length === 0) return;
		if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen && isBusy) return;
		if (!nextOpen) {
			reset();
			setSelectedLibraryId(null);
			setSelectedPathId(null);
			setIsDragging(false);
			dragDepth.current = 0;
		}
		onOpenChange(nextOpen);
	};

	const canUpload = queued.length > 0 && !!targetPathId && !isBusy;
	/** Only previously failed files are left: the action is a retry, not a send. */
	const retryOnly = summary.pending === 0 && retryable.length > 0;

	return (
		<Modal
			open={open}
			onOpenChange={handleOpenChange}
			title={m["library.upload_title"]()}
			description={
				showLibraryPicker
					? m["library.upload_desc_multi"]()
					: m["library.upload_desc"]()
			}
			footer={
				isBusy ? (
					<Button
						type="button"
						variant="outline"
						onClick={() => abortRef.current?.()}
						disabled={transfer?.phase === "processing"}
					>
						{m["library.upload_cancel_transfer"]()}
					</Button>
				) : (
					<>
						<Button
							type="button"
							variant="ghost"
							onClick={() => handleOpenChange(false)}
						>
							{summary.settled && queued.length === 0
								? m["common.close"]()
								: m["common.cancel"]()}
						</Button>
						{/* Nothing left to send: the list is a report, so no primary action. */}
						{queued.length === 0 && summary.settled ? null : retryOnly ? (
							<Button
								type="button"
								onClick={() => uploadMutation.mutate(retryable)}
								disabled={!targetPathId}
							>
								<ArrowClockwise aria-hidden="true" data-icon="inline-start" />
								{m["library.upload_retry_failed"]({ count: retryable.length })}
							</Button>
						) : (
							<Button
								type="button"
								onClick={() => uploadMutation.mutate(queued)}
								disabled={!canUpload}
							>
								{queued.length > 0
									? m["library.upload_action_count"]({ count: queued.length })
									: m["library.upload_action"]()}
							</Button>
						)}
					</>
				)
			}
		>
			{/** biome-ignore lint/a11y/noStaticElementInteractions: a drop canvas has no interactive role; the same files are reachable through the button below. */}
			<div
				className="relative flex min-w-0 flex-col gap-4"
				onDragEnter={onDragEnter}
				onDragOver={(event) => {
					// Without this the browser opens the file instead of dropping it.
					if (acceptsDrop(event)) event.preventDefault();
				}}
				onDragLeave={onDragLeave}
				onDrop={onDrop}
			>
				{!library && (
					<div className="flex flex-col gap-1 rounded-xl bg-muted/40 p-4">
						<p className="font-medium text-foreground text-sm">
							{m["library.upload_no_library_title"]()}
						</p>
						<p className="text-muted-foreground text-sm">
							{m["library.upload_no_library_desc"]()}
						</p>
					</div>
				)}

				{library && enabledPaths.length === 0 && (
					<div className="flex flex-col gap-1 rounded-xl bg-muted/40 p-4">
						<p className="font-medium text-foreground text-sm">
							{m["library.upload_no_folder_title"]()}
						</p>
						<p className="text-muted-foreground text-sm">
							{m["library.upload_no_folder_desc"]()}
						</p>
					</div>
				)}

				{showLibraryPicker && libraries.length > 0 && (
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="upload-library">
							{m["library.upload_library"]()}
						</Label>
						<Select
							items={libraries.map((lib) => ({
								value: String(lib.id),
								label: lib.name,
							}))}
							value={library ? String(library.id) : undefined}
							onValueChange={(v) => {
								setSelectedLibraryId(Number(v));
								setSelectedPathId(null);
							}}
							disabled={isBusy}
						>
							<SelectTrigger id="upload-library" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{libraries.map((lib) => (
										<SelectItem key={lib.id} value={String(lib.id)}>
											{lib.name}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
				)}

				{enabledPaths.length > 1 && (
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="upload-path">
							{m["library.upload_destination"]()}
						</Label>
						<Select
							items={enabledPaths.map((path) => ({
								value: String(path.id),
								label: path.path,
							}))}
							value={targetPathId ? String(targetPathId) : undefined}
							onValueChange={(v) => setSelectedPathId(Number(v))}
							disabled={isBusy}
						>
							<SelectTrigger id="upload-path" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{enabledPaths.map((p) => (
										<SelectItem key={p.id} value={String(p.id)}>
											{p.path}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
				)}

				<input
					ref={inputRef}
					type="file"
					accept={ACCEPT_ATTR}
					multiple
					className="hidden"
					onChange={(e) => {
						if (e.target.files) addFiles(e.target.files);
						e.target.value = "";
					}}
				/>

				<button
					type="button"
					onClick={() => inputRef.current?.click()}
					className={cn(
						"flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center text-muted-foreground text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60",
						isDragging
							? "border-primary bg-primary/5 text-foreground"
							: "border-border",
					)}
					disabled={enabledPaths.length === 0 || isBusy}
				>
					<CloudArrowUp
						aria-hidden="true"
						className={cn("size-6", isDragging && "text-primary")}
					/>
					<span>
						{isDragging ? (
							<span className="font-medium text-foreground">
								{m["library.upload_drop_now"]()}
							</span>
						) : (
							<>
								<span className="font-medium text-foreground">
									{m["library.upload_browse"]()}
								</span>{" "}
								{m["library.upload_drop"]()}
							</>
						)}
					</span>
					<span className="text-xs">{m["library.upload_formats"]()}</span>
				</button>

				{transfer && (
					<div className="flex flex-col gap-1.5">
						<div
							className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
							role="progressbar"
							aria-valuenow={
								transfer.phase === "processing" ? undefined : percent
							}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-label={m["library.upload_progress_label"]()}
						>
							<div
								className={cn(
									"h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none",
									transfer.phase === "processing" && "animate-pulse",
								)}
								style={{ width: `${percent}%` }}
							/>
						</div>
						<p
							className="text-muted-foreground text-xs tabular-nums"
							role="status"
							aria-live="polite"
						>
							{transfer.phase === "processing"
								? m["library.upload_processing"]({ count: transfer.ids.length })
								: m["library.upload_progress"]({
										percent,
										loaded: formatBytes(transfer.fraction * transfer.bytes),
										total: formatBytes(transfer.bytes),
									})}
						</p>
					</div>
				)}

				{errorMessage && (
					<p
						className="rounded-xl bg-destructive/10 px-3 py-2 text-destructive text-sm"
						role="alert"
					>
						{errorMessage}
					</p>
				)}

				{items.length > 0 && (
					<div className="flex min-w-0 flex-col gap-2">
						<div className="flex items-center justify-between gap-2">
							<p className="text-muted-foreground text-xs">
								{summary.settled && queued.length === 0
									? m["library.upload_summary_result"]({
											uploaded: summary.uploaded,
											problems:
												summary.skipped + summary.failed + summary.rejected,
										})
									: m["library.upload_summary_selection"]({
											count: queued.length,
											size: formatBytes(queuedBytes),
										})}
							</p>
							{!isBusy && (
								<button
									type="button"
									onClick={reset}
									className="rounded text-muted-foreground text-xs underline-offset-3 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
								>
									{m["library.upload_clear_all"]()}
								</button>
							)}
						</div>
						<ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
							{items.map((item) => {
								const live = transferStatus?.get(item.id);
								const reason = live ? null : reasonLabel(item.reason);
								return (
									<li
										key={item.id}
										className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm"
									>
										<ItemIcon item={item} transfer={live} />
										<span className="flex min-w-0 flex-1 flex-col">
											<span className="truncate">{item.file.name}</span>
											{reason && (
												<span
													className={cn(
														"truncate text-xs",
														item.status === "skipped"
															? "text-amber-600 dark:text-amber-400"
															: "text-destructive",
													)}
												>
													{reason}
												</span>
											)}
										</span>
										<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
											{formatBytes(item.file.size)}
										</span>
										<button
											type="button"
											onClick={() => setItems(removeItem(items, item.id))}
											disabled={isBusy}
											className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-40 sm:size-9"
											aria-label={m["library.upload_remove_file"]({
												name: item.file.name,
											})}
										>
											<X aria-hidden="true" className="size-3.5" />
										</button>
									</li>
								);
							})}
						</ul>
					</div>
				)}

				{isDragging && (
					<div className="pointer-events-none absolute inset-0 rounded-2xl bg-primary/5 ring-2 ring-primary/40" />
				)}
			</div>
		</Modal>
	);
}
