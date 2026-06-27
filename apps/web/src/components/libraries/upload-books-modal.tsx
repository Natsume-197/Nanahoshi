import {
	EBOOK_EXTENSIONS,
	isSupportedExtension,
	MAX_UPLOAD_BYTES,
} from "@nanahoshi-v2/api/modules/scanning/supportedExtensions";
import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import { env } from "@nanahoshi-v2/env/web";
import { useMutation } from "@tanstack/react-query";
import { Loader2, UploadCloud, X } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { formatFileSize } from "@/utils/format";
import { orpc, queryClient } from "@/utils/orpc";

const ACCEPT_ATTR = EBOOK_EXTENSIONS.map((ext) => `.${ext}`).join(",");

export function UploadBooksModal({
	library,
	open,
	onOpenChange,
}: {
	library: LibraryComplete;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const enabledPaths = (library.paths ?? []).filter(
		(p) => p.isEnabled !== false,
	);
	const inputRef = useRef<HTMLInputElement>(null);
	const [files, setFiles] = useState<File[]>([]);
	const [targetPathId, setTargetPathId] = useState<number | null>(
		enabledPaths[0]?.id ?? null,
	);
	const [isDragging, setIsDragging] = useState(false);

	const uploadMutation = useMutation({
		mutationFn: async () => {
			if (!targetPathId) throw new Error("Choose a destination folder");
			if (files.length === 0) throw new Error("Choose at least one file");

			const formData = new FormData();
			formData.set("libraryPathId", String(targetPathId));
			for (const file of files) formData.append("file", file);

			const res = await fetch(
				`${env.VITE_SERVER_URL}/api/libraries/${library.id}/upload`,
				{ method: "POST", body: formData, credentials: "include" },
			);
			const json = await res.json();
			if (!res.ok) throw new Error(json?.message ?? "Upload failed");
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
				`Uploaded ${result.uploaded.length} file${result.uploaded.length === 1 ? "" : "s"}`,
			);
			if (result.skipped.length > 0) {
				toast.warning(`${result.skipped.length} file(s) skipped`);
			}
			setFiles([]);
			onOpenChange(false);
		},
		onError: (err) => toast.error(err.message),
	});

	const addFiles = (incoming: FileList | File[]) => {
		const accepted = Array.from(incoming).filter((file) => {
			if (!isSupportedExtension(file.name, "ebook")) {
				toast.error(`${file.name}: unsupported type`);
				return false;
			}
			if (file.size > MAX_UPLOAD_BYTES) {
				toast.error(`${file.name}: exceeds 500MB`);
				return false;
			}
			return true;
		});
		if (accepted.length === 0) return;
		setFiles((prev) => {
			const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
			return [
				...prev,
				...accepted.filter((f) => !seen.has(`${f.name}:${f.size}`)),
			];
		});
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

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title="Upload books"
			description="Add EPUB or AZW3 files to this library. A background task processes them after upload."
			footer={
				<>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={uploadMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={submit}
						disabled={
							uploadMutation.isPending || files.length === 0 || !targetPathId
						}
					>
						{uploadMutation.isPending && (
							<Loader2 className="mr-1.5 size-3.5 animate-spin" />
						)}
						Upload {files.length > 0 ? `(${files.length})` : ""}
					</Button>
				</>
			}
		>
			<div className="space-y-4">
				{enabledPaths.length > 1 && (
					<div className="space-y-1.5">
						<Label htmlFor="upload-path">Destination folder</Label>
						<Select
							value={targetPathId ? String(targetPathId) : undefined}
							onValueChange={(v) => setTargetPathId(Number(v))}
						>
							<SelectTrigger id="upload-path">
								<SelectValue placeholder="Choose a folder" />
							</SelectTrigger>
							<SelectContent>
								{enabledPaths.map((p) => (
									<SelectItem key={p.id} value={String(p.id)}>
										{p.path}
									</SelectItem>
								))}
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
					className={`flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center text-muted-foreground text-sm transition-colors hover:border-foreground/30 ${
						isDragging
							? "border-foreground/40 bg-foreground/5"
							: "border-border"
					}`}
				>
					<UploadCloud className="size-6" />
					<span>
						<span className="font-medium text-foreground">Click to browse</span>{" "}
						or drag files here
					</span>
					<span className="text-xs">EPUB or AZW3, up to 500MB each</span>
				</button>

				{files.length > 0 && (
					<ul className="max-h-48 space-y-1.5 overflow-y-auto">
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
									className="shrink-0 text-muted-foreground hover:text-foreground"
									aria-label={`Remove ${file.name}`}
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
