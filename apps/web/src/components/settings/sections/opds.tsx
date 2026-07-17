import { env } from "@nanahoshi-v2/env/web";
import {
	Check,
	CircleNotch,
	Copy,
	Key,
	Plus,
	Trash,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { SettingRows } from "@/components/settings/setting-rows";
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
	const [createOpen, setCreateOpen] = useState(false);
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
			setCreateOpen(false);
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
		<div className="flex flex-col gap-12">
			<div className="flex flex-col gap-2">
				<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
					{m["settings.opds.desc"]()}
				</p>
				<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
					{m["settings.opds.client_hint_pre"]()}{" "}
					<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-xs">
						{env.VITE_SERVER_URL}/opds
					</code>{" "}
					{m["settings.opds.client_hint_post"]()}
				</p>
			</div>

			<section className="flex flex-col gap-6">
				<div className="flex items-center justify-between gap-8">
					<h2 className="font-semibold text-foreground text-xl">
						{m["settings.opds.api_keys"]()}
					</h2>
					<Button
						variant="outline"
						size="sm"
						className="shrink-0"
						onClick={() => {
							setName("");
							setCreateOpen(true);
						}}
					>
						<Plus data-icon="inline-start" />
						{m["settings.opds.create_key"]()}
					</Button>
				</div>

				{isLoading ? (
					<SettingRows>
						{["a", "b"].map((key) => (
							<div key={key} className="flex items-center gap-3 py-3">
								<Skeleton className="size-5 rounded" />
								<div className="flex flex-1 flex-col gap-1.5">
									<Skeleton className="h-4 w-40" />
									<Skeleton className="h-3 w-56" />
								</div>
							</div>
						))}
					</SettingRows>
				) : keys?.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{m["settings.opds.none"]()}
					</p>
				) : (
					<ul className="flex flex-col">
						{keys?.map((key, index) => (
							<li key={key.id}>
								<div className="flex items-center gap-3 py-3">
									<Key className="size-5 shrink-0 text-muted-foreground" />
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
										aria-label={m["common.delete"]()}
									>
										<Trash />
									</Button>
								</div>
								{index < keys.length - 1 && (
									<Separator className="bg-border/60" />
								)}
							</li>
						))}
					</ul>
				)}
			</section>

			{/* Create new key */}
			<Modal
				open={createOpen}
				onOpenChange={(open) => {
					if (!open) setCreateOpen(false);
				}}
				title={m["settings.opds.create_title"]()}
				description={m["settings.opds.name_desc"]()}
				onSubmit={(event) => {
					event.preventDefault();
					handleCreate();
				}}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setCreateOpen(false)}
							disabled={createMutation.isPending}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="submit"
							disabled={createMutation.isPending || !name.trim()}
						>
							{createMutation.isPending && (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							)}
							{m["settings.opds.create_key"]()}
						</Button>
					</>
				}
			>
				<Input
					autoFocus
					placeholder={m["settings.opds.name_placeholder"]()}
					value={name}
					onChange={(e) => setName(e.target.value)}
					disabled={createMutation.isPending}
				/>
			</Modal>

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
