import { env } from "@nanahoshi-v2/env/web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Check,
	Copy,
	Info,
	KeyRound,
	Loader2,
	Plus,
	Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { m } from "@/paraglide/messages";
import { formatDate } from "@/utils/format";
import { orpc } from "@/utils/orpc";

export function OpdsSettings() {
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [createdKey, setCreatedKey] = useState<{
		id: string;
		name: string | null;
		key: string;
	} | null>(null);

	const { data: keys, isLoading } = useQuery(orpc.opdsKeys.list.queryOptions());

	const createMutation = useMutation({
		...orpc.opdsKeys.create.mutationOptions(),
		onSuccess: (result) => {
			queryClient.invalidateQueries({
				queryKey: orpc.opdsKeys.list.key(),
			});
			setCreatedKey(result);
			setName("");
		},
		onError: (err) => toast.error(err.message),
	});

	const deleteMutation = useMutation({
		...orpc.opdsKeys.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.opdsKeys.list.key(),
			});
			toast.success(m["toast.api_key_deleted"]());
		},
		onError: (err) => toast.error(err.message),
	});

	const handleCreate = () => {
		if (!name.trim()) {
			toast.error(m["settings.opds.name_required"]());
			return;
		}
		createMutation.mutate({ name: name.trim() });
	};

	return (
		<div className="space-y-8">
			<div>
				<p className="mt-1 text-muted-foreground text-sm">
					{m["settings.opds.desc"]()}
				</p>
			</div>

			{/* Info box */}
			<div className="flex gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
				<Info className="mt-0.5 size-4 shrink-0 text-primary" />
				<div className="space-y-1 text-muted-foreground">
					<p>
						{m["settings.opds.client_hint_pre"]()}{" "}
						<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-xs">
							{env.VITE_SERVER_URL}/opds
						</code>{" "}
						{m["settings.opds.client_hint_post"]()}
					</p>
				</div>
			</div>

			{/* Existing keys */}
			<section>
				<h3 className="mb-3 font-semibold text-sm">
					{m["settings.opds.api_keys"]()}
				</h3>
				<div className="space-y-2">
					{isLoading ? (
						<>
							<Skeleton className="h-16 w-full rounded-lg" />
							<Skeleton className="h-16 w-full rounded-lg" />
						</>
					) : keys?.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{m["settings.opds.none"]()}
						</p>
					) : (
						keys?.map((key) => (
							<div
								key={key.id}
								className="flex items-center gap-4 rounded-lg border p-4"
							>
								<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
									<KeyRound className="size-4 text-primary" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium text-sm">{key.name}</p>
									<p className="truncate text-muted-foreground text-xs">
										<span className="font-mono">{key.start}...</span>
										{key.lastRequest && (
											<>
												{" "}
												·{" "}
												{m["settings.opds.last_used"]({
													date: formatDate(key.lastRequest),
												})}
											</>
										)}
									</p>
								</div>
								<Button
									variant="ghost"
									size="icon"
									className="shrink-0 text-muted-foreground hover:text-destructive"
									onClick={() => deleteMutation.mutate({ keyId: key.id })}
									disabled={deleteMutation.isPending}
								>
									<Trash2 className="size-4" />
								</Button>
							</div>
						))
					)}
				</div>
			</section>

			<Separator />

			{/* Create new key */}
			<section>
				<h3 className="mb-4 font-semibold text-sm">
					{m["settings.opds.create_title"]()}
				</h3>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label>
							{m["settings.org.name"]()}{" "}
							<span className="text-destructive">*</span>
						</Label>
						<Input
							placeholder={m["settings.opds.name_placeholder"]()}
							value={name}
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleCreate();
							}}
						/>
						<p className="text-muted-foreground text-xs">
							{m["settings.opds.name_desc"]()}
						</p>
					</div>
					<Button
						onClick={handleCreate}
						disabled={createMutation.isPending || !name.trim()}
					>
						{createMutation.isPending ? (
							<Loader2 className="mr-2 size-4 animate-spin" />
						) : (
							<Plus className="mr-2 size-4" />
						)}
						{m["settings.opds.create_key"]()}
					</Button>
				</div>
			</section>

			{/* Display newly created key */}
			<CreatedKeyDialog
				keyData={createdKey}
				onClose={() => setCreatedKey(null)}
			/>
		</div>
	);
}

function CreatedKeyDialog({
	keyData,
	onClose,
}: {
	keyData: { id: string; name: string | null; key: string } | null;
	onClose: () => void;
}) {
	const [copied, setCopied] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleCopy = () => {
		if (!keyData) return;
		navigator.clipboard.writeText(keyData.key);
		setCopied(true);
		toast.success(m["toast.copied_to_clipboard"]());
		setTimeout(() => setCopied(false), 2000);
	};

	const handleClose = () => {
		setCopied(false);
		setRevealed(false);
		onClose();
	};

	return (
		<Modal
			open={!!keyData}
			onOpenChange={handleClose}
			title={m["settings.opds.created_title"]()}
			description={m["settings.opds.created_desc"]()}
			className="sm:max-w-md"
			footer={
				<Button onClick={handleClose}>{m["settings.opds.done"]()}</Button>
			}
		>
			<div className="space-y-4">
				<div className="space-y-1.5">
					<Label className="text-muted-foreground text-xs">
						{m["settings.org.name"]()}
					</Label>
					<p className="font-medium text-sm">{keyData?.name}</p>
				</div>
				<div className="space-y-1.5">
					<Label className="text-muted-foreground text-xs">
						{m["settings.opds.secret_key"]()}
					</Label>
					<div className="flex gap-2">
						<Input
							ref={inputRef}
							type={revealed ? "text" : "password"}
							value={keyData?.key ?? ""}
							readOnly
							className="font-mono text-xs"
							onClick={() => {
								setRevealed(true);
								inputRef.current?.select();
							}}
						/>
						<Button
							variant="outline"
							size="icon"
							className="shrink-0"
							onClick={handleCopy}
						>
							{copied ? (
								<Check className="size-4" />
							) : (
								<Copy className="size-4" />
							)}
						</Button>
					</div>
				</div>
			</div>
		</Modal>
	);
}
