import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	SettingControlRow,
	SettingRows,
} from "@/components/settings/setting-rows";
import { Switch } from "@/components/ui/switch";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { invalidateLibraries } from "./utils";

/**
 * Visibility only. Renaming lives on the library header, where the name already
 * is — a separate "Name / Edit" row said the same thing twice.
 */
export function GeneralSection({
	library,
	canManage,
}: {
	library: LibraryComplete;
	canManage: boolean;
}) {
	const updateMutation = useMutation({
		...orpc.libraries.updateLibrary.mutationOptions(),
		onSuccess: () => {
			invalidateLibraries();
			toast.success(m["library.updated"]());
		},
		onError: (err) => toast.error(err.message),
	});

	return (
		<SettingRows>
			{library.mediaType === "ebook" && (
				<SettingControlRow
					label={
						<h3 className="font-medium text-base text-foreground">
							{m["library.automatic_grouping"]()}
						</h3>
					}
					description={m["library.automatic_grouping_desc"]()}
				>
					<Switch
						checked={library.automaticGroupingEnabled}
						disabled={!canManage || updateMutation.isPending}
						onCheckedChange={(checked) =>
							updateMutation.mutate({
								uuid: library.uuid,
								automaticGroupingEnabled: checked,
							})
						}
						aria-label={m["library.toggle_automatic_grouping"]()}
					/>
				</SettingControlRow>
			)}

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
	);
}
