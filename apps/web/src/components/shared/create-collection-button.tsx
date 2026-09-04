import {
	CircleNotch,
	FolderPlus,
	FunnelSimple,
	Plus,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { DynamicCollectionEditor } from "@/components/collections/dynamic-collection-editor";
import { emptyDynamicCollectionDefinition } from "@/components/collections/dynamic-collection-templates";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useAbilities } from "@/hooks/use-abilities";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

/**
 * Button + dialog for the collections page. Renders nothing without the
 * permission; the rail's create menu opens the dialog on its own.
 */
export function CreateCollectionButton({
	iconOnly = false,
	className,
}: {
	iconOnly?: boolean;
	className?: string;
} = {}) {
	const { can } = useAbilities();
	const [isOpen, setIsOpen] = useState(false);

	if (!can("collection", "create")) return null;

	return (
		<>
			<Button
				type="button"
				size={iconOnly ? "icon" : "default"}
				aria-label={iconOnly ? m["collection.new"]() : undefined}
				className={cn(iconOnly && "rounded-full", className)}
				onClick={() => setIsOpen(true)}
			>
				<Plus aria-hidden="true" data-icon="inline-start" />
				{iconOnly ? null : m["collection.new"]()}
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
	const [mode, setMode] = useState<"choice" | "manual" | "dynamic">("choice");
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
			setMode("choice");
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
	const close = () => {
		onOpenChange(false);
		setName("");
		setIsPublic(false);
		setMode("choice");
	};

	if (mode === "choice") {
		return (
			<Modal
				open={open}
				onOpenChange={(next) => (next ? onOpenChange(true) : close())}
				title={m["collection.create_title"]()}
				description={m["collection.create_desc"]()}
			>
				<div className="flex flex-col gap-3">
					<Button
						type="button"
						variant="outline"
						size="lg"
						className="h-14 w-full justify-start"
						onClick={() => setMode("manual")}
					>
						<FolderPlus data-icon="inline-start" aria-hidden="true" />
						{m["collection.create_manual_title"]()}
					</Button>
					<Button
						type="button"
						variant="outline"
						size="lg"
						className="h-14 w-full justify-start"
						onClick={() => setMode("dynamic")}
					>
						<FunnelSimple data-icon="inline-start" aria-hidden="true" />
						{m["collection.create_dynamic_title"]()}
					</Button>
				</div>
			</Modal>
		);
	}

	if (mode === "dynamic") {
		return (
			<DynamicCollectionEditor
				open={open}
				onOpenChange={(next) => {
					if (!next) close();
				}}
				title={m["collection.dynamic_editor_create_title"]()}
				description={m["collection.dynamic_editor_create_desc"]()}
				initial={emptyDynamicCollectionDefinition()}
				submitLabel={m["common.create"]()}
				isSubmitting={createMutation.isPending}
				onSubmit={(value) =>
					createMutation.mutateAsync({ ...value, kind: "dynamic" })
				}
			/>
		);
	}

	return (
		<Modal
			open={open}
			onOpenChange={(next) => (next ? onOpenChange(true) : close())}
			onSubmit={handleCreate}
			title={m["collection.create_manual_title"]()}
			description={m["collection.create_manual_desc"]()}
			footer={
				<>
					<Button
						type="button"
						variant="outline"
						disabled={createMutation.isPending}
						onClick={close}
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
