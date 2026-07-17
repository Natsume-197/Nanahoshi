import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import { CircleNotch } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	SettingControlRow,
	SettingRow,
	SettingRows,
} from "@/components/settings/setting-rows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { invalidateLibraries } from "./utils";

export function GeneralSection({
	library,
	canManage,
}: {
	library: LibraryComplete;
	canManage: boolean;
}) {
	const [renameOpen, setRenameOpen] = useState(false);
	const [draft, setDraft] = useState("");

	const updateMutation = useMutation({
		...orpc.libraries.updateLibrary.mutationOptions(),
		onSuccess: () => {
			invalidateLibraries();
			toast.success(m["library.updated"]());
			setRenameOpen(false);
		},
		onError: (err) => toast.error(err.message),
	});

	const currentName = library.name ?? "";
	const changed = draft.trim() !== currentName && draft.trim() !== "";

	return (
		<>
			<SettingRows>
				<SettingRow
					label={m["library.name"]()}
					value={library.name ?? m["library.untitled"]()}
					onEdit={
						canManage
							? () => {
									setDraft(currentName);
									setRenameOpen(true);
								}
							: undefined
					}
					editLabel={m["common.edit"]()}
				/>

				<SettingControlRow
					label={
						<h3 className="font-medium text-base text-foreground">
							{m["library.public_title"]()}
						</h3>
					}
					description={m["library.public_desc_full"]()}
				>
					<Switch
						checked={library.isPublic}
						disabled={!canManage || updateMutation.isPending}
						onCheckedChange={(checked) =>
							updateMutation.mutate({ uuid: library.uuid, isPublic: checked })
						}
						aria-label={m["library.toggle_public"]()}
					/>
				</SettingControlRow>
			</SettingRows>

			<Modal
				open={renameOpen}
				onOpenChange={(open) => {
					if (!open) setRenameOpen(false);
				}}
				title={m["common.rename"]()}
				onSubmit={(event) => {
					event.preventDefault();
					if (changed && !updateMutation.isPending)
						updateMutation.mutate({ uuid: library.uuid, name: draft.trim() });
				}}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setRenameOpen(false)}
							disabled={updateMutation.isPending}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="submit"
							disabled={!changed || updateMutation.isPending}
						>
							{updateMutation.isPending && (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							)}
							{m["common.save"]()}
						</Button>
					</>
				}
			>
				<Label htmlFor="library-rename-input">{m["library.name"]()}</Label>
				<Input
					id="library-rename-input"
					autoFocus
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder={m["library.name_placeholder"]()}
					disabled={updateMutation.isPending}
				/>
			</Modal>
		</>
	);
}
