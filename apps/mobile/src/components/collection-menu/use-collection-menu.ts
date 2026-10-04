import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { askChoice, showNotice } from "@/components/prompt";
import { useCan } from "@/lib/abilities";
import { t } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { useApi } from "@/providers/app-provider";
import type { MenuItem } from "../action-menu/types";
import { icons } from "../icon-names";
import {
	type CollectionAction,
	type CollectionTarget,
	collectionActions,
} from "./model";

export type { CollectionTarget } from "./model";

/** The web's collection context menu: edit, publish or hide (manual ones),
 * delete. Only the owner gets actions; the server re-checks permissions. */
export function useCollectionMenu(
	collection: CollectionTarget | null | undefined,
	{ onDeleted }: { onDeleted?: () => void } = {},
): MenuItem[][] {
	const { orpc, client } = useApi();
	const queryClient = useQueryClient();
	const can = useCan();
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: orpc.collections.key() });

	const visibility = useMutation({
		mutationFn: (input: { collectionId: string; isPublic: boolean }) =>
			client.collections.updateVisibility(input),
		onSuccess: () => void refresh(),
		onError: () => showNotice(t("toast.collection_update_failed")),
	});
	const remove = useMutation({
		mutationFn: (collectionId: string) =>
			client.collections.delete({ collectionId }),
		onSuccess: async () => {
			await refresh();
			onDeleted?.();
		},
		onError: () => showNotice(t("toast.collection_delete_failed")),
	});

	if (!collection) return [];
	const { id, name, isPublic, kind } = collection;
	const items: Record<CollectionAction, MenuItem> = {
		edit: {
			id: "edit",
			label: t("common.edit"),
			icon: icons.edit,
			onPress: () => router.push(routes.editCollection(id, kind)),
		},
		visibility: {
			id: "visibility",
			label: isPublic
				? t("collection.make_private")
				: t("collection.make_public"),
			icon: isPublic ? icons.privacy : icons.globe,
			onPress: () =>
				visibility.mutate({ collectionId: id, isPublic: !isPublic }),
		},
		delete: {
			id: "delete",
			label: t("common.delete"),
			icon: icons.trash,
			destructive: true,
			onPress: async () => {
				const answer = await askChoice({
					title: t("collection.delete_title"),
					message: t("collection.delete_desc", { name }),
					options: [
						{ id: "delete", label: t("common.delete"), destructive: true },
					],
				});
				if (answer === "delete") remove.mutate(id);
			},
		},
	};
	return collectionActions(collection, can).map((section) =>
		section.map((action) => items[action]),
	);
}
