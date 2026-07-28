import { CircleNotch, FolderPlus, Plus } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useAbilities } from "@/hooks/use-abilities";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

/**
 * Button + dialog for the collections page. Renders nothing without the
 * permission; the rail's create menu opens the dialog on its own.
 */
export function CreateCollectionButton() {
	const { can } = useAbilities();
	const [isOpen, setIsOpen] = useState(false);

	if (!can("collection", "create")) return null;

	return (
		<>
			<Button type="button" onClick={() => setIsOpen(true)}>
				<Plus data-icon="inline-start" />
				{m["collection.new"]()}
			</Button>
			<CreateCollectionDialog open={isOpen} onOpenChange={setIsOpen} />
		</>
	);
}

/** The create-collection form itself, so any trigger can own its own open
 *  state. Callers are responsible for the permission check. */
export function CreateCollectionDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [isPublic, setIsPublic] = useState(false);
	const nameFieldId = useId();
	const publicFieldId = useId();

	const createMutation = useMutation({
		...orpc.collections.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.collections.list.queryOptions().queryKey,
			});
			onOpenChange(false);
			setName("");
			setIsPublic(false);
			toast.success(m["toast.collection_created"]());
		},
		onError: (err) => toast.error(err.message),
	});

	const handleCreate = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		createMutation.mutate({ name: trimmed, isPublic });
	};

	return (
		<Modal
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) {
					setName("");
					setIsPublic(false);
				}
			}}
			onSubmit={handleCreate}
			title={m["collection.create_title"]()}
			description={m["collection.create_desc"]()}
			footer={
				<>
					<Button
						type="button"
						variant="outline"
						disabled={createMutation.isPending}
						onClick={() => onOpenChange(false)}
					>
						{m["common.cancel"]()}
					</Button>
					<Button
						type="submit"
						disabled={createMutation.isPending || name.trim().length === 0}
					>
						{createMutation.isPending ? (
							<CircleNotch className="animate-spin" data-icon="inline-start" />
						) : (
							<FolderPlus data-icon="inline-start" />
						)}
						{m["common.create"]()}
					</Button>
				</>
			}
		>
			<div className="space-y-1.5">
				<Label htmlFor={nameFieldId}>{m["collection.name_label"]()}</Label>
				<Input
					id={nameFieldId}
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder={m["collection.create_placeholder"]()}
					maxLength={80}
					autoFocus
				/>
			</div>

			<Label
				htmlFor={publicFieldId}
				className="justify-between rounded-md border border-border/70 bg-background/60 px-3 py-2"
			>
				<div className="space-y-0.5">
					<p className="font-medium text-sm">
						{m["collection.public_title"]()}
					</p>
					<p className="text-muted-foreground text-xs">
						{m["collection.public_desc"]()}
					</p>
				</div>
				<Checkbox
					id={publicFieldId}
					checked={isPublic}
					onCheckedChange={(checked) => setIsPublic(checked === true)}
				/>
			</Label>
		</Modal>
	);
}
