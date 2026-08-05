import {
	EBOOK_EXTENSIONS,
	isSupportedExtension,
	isUploadBatchTooLarge,
	MAX_UPLOAD_BYTES,
} from "@nanahoshi-v2/api/modules/scanning/supportedExtensions";
import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import { env } from "@nanahoshi-v2/env/web";
import { CircleNotch, CloudArrowUp, X } from "@phosphor-icons/react";
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
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatFileSize } from "@/utils/format";
import { orpc, queryClient } from "@/utils/orpc";
import {
	resolveUploadTargetLibrary,
	resolveUploadTargetPathId,
} from "./library-ui-state";

const ACCEPT_ATTR = EBOOK_EXTENSIONS.map((ext) => `.${ext}`).join(",");

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
	const [files, setFiles] = useState<File[]>([]);
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

	const uploadMutation = useMutation({
		mutationFn: async () => {
			if (!library) throw new Error(m["library.upload_no_library_title"]());
			if (!targetPathId) throw new Error(m["library.upload_choose_folder"]());
			if (files.length === 0)
				throw new Error(m["library.upload_choose_file"]());

			const formData = new FormData();
			formData.set("libraryPathId", String(targetPathId));
			for (const file of files) formData.append("file", file);

			let res: Response;
			try {
				res = await fetch(
					`${env.VITE_SERVER_URL}/api/libraries/${library.uuid}/upload`,
					{ method: "POST", body: formData, credentials: "include" },
				);
			} catch {
				throw new Error(m["library.upload_network_failed"]());
			}
			const json = await res.json().catch(() => null);
			if (!res.ok)
				throw new Error(
					res.status === 413
						? m["library.upload_batch_too_large"]()
						: (json?.message ?? m["library.upload_failed"]()),
				);
			return json as {
				uploaded: string[];
				skipped: { filename: string; reason: string }[];
			};
		},
		onSuccess: (result) => {
			queryClient.invalidateQueries({
				queryKey: orpc.books.listByLibrary.key(),
			});
			toast.success(
				m["library.upload_success"]({ count: result.uploaded.length }),
			);
			if (result.skipped.length > 0) {
				const dupes = result.skipped.filter(
					(s) => s.reason === "duplicate",
				).length;
				toast.warning(
					dupes > 0
						? m["library.upload_skipped_duplicates"]({
								count: result.skipped.length,
								duplicates: dupes,
							})
						: m["library.upload_skipped"]({ count: result.skipped.length }),
				);
			}
			setFiles([]);
			onOpenChange(false);
		},
		onError: (err) => toast.error(err.message),
	});

	const addFiles = (incoming: FileList | File[]) => {
		const accepted = Array.from(incoming).filter((file) => {
			if (!isSupportedExtension(file.name, "ebook")) {
				toast.error(m["library.upload_unsupported"]({ name: file.name }));
				return false;
			}
			if (file.size > MAX_UPLOAD_BYTES) {
				toast.error(m["library.upload_too_large"]({ name: file.name }));
				return false;
			}
			return true;
		});
		if (accepted.length === 0) return;
		const seen = new Set(files.map((file) => `${file.name}:${file.size}`));
		const nextFiles = [
			...files,
			...accepted.filter((file) => !seen.has(`${file.name}:${file.size}`)),
		];
		if (isUploadBatchTooLarge(nextFiles)) {
			toast.error(m["library.upload_batch_too_large"]());
			return;
		}
		setFiles(nextFiles);
	};

	const removeFile = (index: number) => {
		setFiles((prev) => prev.filter((_, i) => i !== index));
	};

	const onDrop = (event: DragEvent<HTMLButtonElement>) => {
		event.preventDefault();
		setIsDragging(false);
		if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
	};

	const submit = () => uploadMutation.mutate();
	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen && uploadMutation.isPending) return;
		if (!nextOpen) {
			setFiles([]);
			setSelectedLibraryId(null);
			setSelectedPathId(null);
			setIsDragging(false);
		}
		onOpenChange(nextOpen);
	};

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
				<>
					<Button
						type="button"
						variant="ghost"
						onClick={() => handleOpenChange(false)}
						disabled={uploadMutation.isPending}
					>
						{m["common.cancel"]()}
					</Button>
					<Button
						type="button"
						onClick={submit}
						disabled={
							uploadMutation.isPending || files.length === 0 || !targetPathId
						}
					>
						{uploadMutation.isPending && (
							<CircleNotch className="mr-1.5 size-3.5 animate-spin" />
						)}
						{files.length > 0
							? m["library.upload_action_count"]({ count: files.length })
							: m["library.upload_action"]()}
					</Button>
				</>
			}
		>
			<div className="flex min-w-0 flex-col gap-4">
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
					onDragOver={(e) => {
						e.preventDefault();
						setIsDragging(true);
					}}
					onDragLeave={() => setIsDragging(false)}
					onDrop={onDrop}
					className={cn(
						"flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center text-muted-foreground text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/30",
						isDragging
							? "border-foreground/40 bg-foreground/5"
							: "border-border",
					)}
					disabled={enabledPaths.length === 0 || uploadMutation.isPending}
				>
					<CloudArrowUp className="size-6" />
					<span>
						<span className="font-medium text-foreground">
							{m["library.upload_browse"]()}
						</span>{" "}
						{m["library.upload_drop"]()}
					</span>
					<span className="text-xs">{m["library.upload_formats"]()}</span>
				</button>

				{files.length > 0 && (
					<ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
						{files.map((file, index) => (
							<li
								key={`${file.name}:${file.size}`}
								className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm"
							>
								<span className="min-w-0 flex-1 truncate">{file.name}</span>
								<span className="shrink-0 text-muted-foreground text-xs">
									{formatFileSize(Math.round(file.size / 1024))}
								</span>
								<button
									type="button"
									onClick={() => removeFile(index)}
									disabled={uploadMutation.isPending}
									className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 sm:size-9"
									aria-label={m["library.upload_remove_file"]({
										name: file.name,
									})}
								>
									<X className="size-3.5" />
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</Modal>
	);
}
